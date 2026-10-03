const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const testDbPath = path.join(__dirname, `test-legacy-plan-owners-${process.pid}.db`);
const testDbFiles = [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`];
if (testDbFiles.some(file => fs.existsSync(file))) {
  throw new Error(`Refusing to overwrite an existing test database: ${testDbPath}`);
}

process.env.DB_PATH = testDbPath;
process.env.JWT_SECRET = "test-legacy-owner-secret";

const { DatabaseSync } = require("node:sqlite");
const express = require("express");
const jwt = require("jsonwebtoken");
const { assignLegacyPlanOwners } = require("./assign-legacy-plan-owners");
const db = require("../db");
const plansRoutes = require("../routes/plans");

let server;
let passed = 0;
let baseUrl;

function testDatabaseSnapshot(database) {
  return {
    plans: database.prepare("SELECT * FROM plans ORDER BY id").all().map(row => ({ ...row })),
    groups: database.prepare("SELECT * FROM groups ORDER BY id").all().map(row => ({ ...row })),
    walletTransactions: database.prepare("SELECT * FROM wallet_transactions ORDER BY id").all().map(row => ({ ...row })),
    notifications: database.prepare("SELECT * FROM notifications ORDER BY id").all().map(row => ({ ...row })),
  };
}

function expectedSnapshotAfterOwnership(before) {
  return {
    ...before,
    plans: before.plans.map(plan => ({
      ...plan,
      owner_id: [10, 12].includes(plan.id) ? 1 : plan.owner_id,
    })),
  };
}

function createMigrationFixture(options = {}) {
  const fixture = new DatabaseSync(":memory:");
  fixture.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT NOT NULL);
    CREATE TABLE plans (id INTEGER PRIMARY KEY, name TEXT NOT NULL, owner_id INTEGER);
  `);
  if (options.ownerExists !== false) {
    fixture.prepare("INSERT INTO users (id, role) VALUES (1, ?)").run(options.ownerRole || "owner");
  }
  fixture.prepare("INSERT INTO users (id, role) VALUES (2, 'owner')").run();

  fixture.prepare("INSERT INTO plans (id, name, owner_id) VALUES (10, ?, ?)")
    .run(options.spotifyName || "Spotify", options.spotifyOwner ?? null);
  if (options.includeYouTube !== false) {
    fixture.prepare("INSERT INTO plans (id, name, owner_id) VALUES (12, ?, ?)")
      .run(options.youtubeName || "YouTube", options.youtubeOwner ?? null);
  }
  if (options.failYouTubeUpdate) {
    fixture.exec(`
      CREATE TRIGGER reject_youtube_owner_update
      BEFORE UPDATE OF owner_id ON plans
      WHEN NEW.id = 12
      BEGIN
        SELECT RAISE(ABORT, 'injected update failure');
      END;
    `);
  }
  return fixture;
}

function assertMigrationFailureLeavesOwnershipUnchanged(options, expectedError) {
  const fixture = createMigrationFixture(options);
  try {
    const before = fixture.prepare("SELECT id, name, owner_id FROM plans ORDER BY id").all();
    assert.throws(() => assignLegacyPlanOwners(fixture), expectedError);
    const after = fixture.prepare("SELECT id, name, owner_id FROM plans ORDER BY id").all();
    assert.deepEqual(after, before);
  } finally {
    fixture.close();
  }
}

async function runTest(name, callback) {
  await callback();
  passed += 1;
  console.log(`✓ ${passed}. ${name}`);
}

function insertTestData() {
  const insertUser = db.prepare(`
    INSERT INTO users (id, fullname, email, password_hash, role, wallet_balance, email_verified)
    VALUES (?, ?, ?, 'hash', ?, 0, 1)
  `);
  insertUser.run(1, "Production Owner Fixture", "owner@test.local", "owner");
  insertUser.run(2, "Second Owner Fixture", "owner2@test.local", "owner");
  insertUser.run(3, "Admin Fixture", "admin@test.local", "admin");
  insertUser.run(4, "Member Fixture", "member@test.local", "member");

  const insertPlan = db.prepare(`
    INSERT INTO plans (id, name, logo, color, solo_price, price_per_seat, family_price, default_seats, owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPlan.run(10, "Spotify", "spotify.png", "#111111", 300000, 50000, 150000, 4, null);
  insertPlan.run(12, "YouTube", "youtube.png", "#222222", 400000, 60000, 200000, 4, null);
  insertPlan.run(13, "Other Owner Plan", null, null, 100000, 25000, 70000, 4, 2);
  insertPlan.run(14, "Unassigned Plan", null, null, 100000, 25000, 70000, 4, null);

  const insertGroup = db.prepare(`
    INSERT INTO groups (id, plan_id, manager_id, seats_total, price_per_seat, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `);
  insertGroup.run(100, 10, 1, 4, 51000);
  insertGroup.run(101, 12, 1, 4, 62000);
  insertGroup.run(102, 13, 2, 4, 26000);

  db.prepare(`
    INSERT INTO wallet_transactions (id, user_id, type, description, amount, status, reference)
    VALUES (200, 4, 'plan_payment', 'Historical payment', -51000, 'success', 'legacy-owner-test-tx')
  `).run();
  db.prepare(`
    INSERT INTO notifications (id, user_id, text, type, link)
    VALUES (300, 4, 'Existing notification', 'general', '/dashboard')
  `).run();
}

function createToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

async function requestPatch(planId, token, body) {
  const response = await fetch(`${baseUrl}/api/plans/${planId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

async function closeServer() {
  if (!server) return;
  const closed = new Promise(resolve => server.close(resolve));
  if (server.closeAllConnections) server.closeAllConnections();
  await closed;
}

async function runTests() {
  console.log("--- Starting legacy plan ownership migration tests ---");
  try {
    insertTestData();

    const app = express();
    app.use(express.json());
    app.use("/api/plans", plansRoutes);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    await runTest("migration assigns only owner_id on the two exact legacy plans", () => {
      const before = testDatabaseSnapshot(db);
      const assigned = assignLegacyPlanOwners(db);
      assert.deepEqual(assigned.map(plan => [plan.id, plan.name, plan.owner_id]), [
        [10, "Spotify", 1],
        [12, "YouTube", 1],
      ]);
      assert.deepEqual(testDatabaseSnapshot(db), expectedSnapshotAfterOwnership(before));
      assert.equal(db.prepare("SELECT owner_id FROM plans WHERE id = 13").get().owner_id, 2);
      assert.equal(db.prepare("SELECT owner_id FROM plans WHERE id = 14").get().owner_id, null);
    });

    await runTest("migration is idempotent for plans already assigned to owner 1", () => {
      const before = testDatabaseSnapshot(db);
      assignLegacyPlanOwners(db);
      assert.deepEqual(testDatabaseSnapshot(db), before);
    });

    await runTest("wrong or missing owner role aborts without changes", () => {
      assertMigrationFailureLeavesOwnershipUnchanged({ ownerRole: "admin" }, /must exist and have the owner role/);
      assertMigrationFailureLeavesOwnershipUnchanged({ ownerExists: false }, /must exist and have the owner role/);
    });

    await runTest("missing plan ID or mismatched exact name aborts without partial assignment", () => {
      assertMigrationFailureLeavesOwnershipUnchanged({ includeYouTube: false }, /Plan 12 must exist/);
      assertMigrationFailureLeavesOwnershipUnchanged({ youtubeName: "Youtube" }, /Plan 12 must exist/);
    });

    await runTest("plan already owned by a different account aborts without changes", () => {
      assertMigrationFailureLeavesOwnershipUnchanged({ youtubeOwner: 2 }, /already assigned to another owner/);
    });

    await runTest("transaction rolls back the first assignment if the second update fails", () => {
      assertMigrationFailureLeavesOwnershipUnchanged({ failYouTubeUpdate: true }, /injected update failure/);
    });

    await runTest("PATCH preserves exact owner matching, NULL-plan denial, and admin bypass", async () => {
      const ownerToken = createToken(1, "owner");
      const otherOwnerToken = createToken(2, "owner");
      const adminToken = createToken(3, "admin");

      assert.equal((await requestPatch(10, ownerToken, { name: "Spotify owner edit" })).status, 200);
      assert.equal((await requestPatch(12, ownerToken, { name: "YouTube owner edit" })).status, 200);
      assert.equal((await requestPatch(10, otherOwnerToken, { name: "Other owner attempt" })).status, 403);
      assert.equal((await requestPatch(13, ownerToken, { name: "Claim another owner's plan" })).status, 403);
      assert.equal((await requestPatch(14, ownerToken, { name: "Claim NULL-owner plan" })).status, 403);
      assert.equal((await requestPatch(14, adminToken, { name: "Admin edit" })).status, 200);
    });

    console.log(`\n${passed}/${passed} migration and ownership tests passed.\n`);
  } finally {
    await closeServer();
    db.close();
    for (const file of testDbFiles) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

runTests().catch(error => {
  console.error("Test failure:", error);
  process.exitCode = 1;
});