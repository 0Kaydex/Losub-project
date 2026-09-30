// Automated test suite for Owner Plan Editing + Price Propagation
// Tests all 16 requirements specified for the feature.

const path = require("path");
const fs = require("fs");
const assert = require("node:assert");

// Configure test environment before requiring app modules
const testDbPath = path.join(__dirname, "test-losub.db");
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.DB_PATH = testDbPath;
process.env.JWT_SECRET = "test-jwt-secret-key-12345";
process.env.RESEND_API_KEY = "re_test_key";

const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");

// Build a test Express app using the real routes and middleware
const app = express();
app.use(express.json());

const plansRoutes = require("../routes/plans");
const groupsRoutes = require("../routes/groups");

app.use("/api/plans", plansRoutes);
app.use("/api/groups", groupsRoutes);

let server;
let baseUrl;

function createToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

async function request(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const status = res.status;
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  return { status, ok: res.ok, data };
}

async function runTests() {
  console.log("--- Starting Owner Plan Editing & Price Propagation Test Suite ---");

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ---------------------------------------------------------
    // Setup test users: Admin, Owner A, Owner B, Member 1, Member 2
    // ---------------------------------------------------------
    const insertUser = db.prepare(`
      INSERT INTO users (fullname, email, password_hash, role, wallet_balance, email_verified)
      VALUES (?, ?, 'hash', ?, ?, 1)
    `);

    const adminId = Number(insertUser.run("Admin User", "admin@test.com", "admin", 10000000).lastInsertRowid);
    const ownerAId = Number(insertUser.run("Owner Alice", "alice@test.com", "owner", 10000000).lastInsertRowid);
    const ownerBId = Number(insertUser.run("Owner Bob", "bob@test.com", "owner", 10000000).lastInsertRowid);
    const member1Id = Number(insertUser.run("Member 1", "member1@test.com", "member", 500000).lastInsertRowid);
    const member2Id = Number(insertUser.run("Member 2", "member2@test.com", "member", 500000).lastInsertRowid);

    const adminToken = createToken(adminId, "admin");
    const ownerAToken = createToken(ownerAId, "owner");
    const ownerBToken = createToken(ownerBId, "owner");
    const member1Token = createToken(member1Id, "member");
    const member2Token = createToken(member2Id, "member");

    // ---------------------------------------------------------
    // Test 1: owner_id migration
    // ---------------------------------------------------------
    console.log("Test 1: Checking owner_id column exists on plans table...");
    const tableInfo = db.prepare("PRAGMA table_info(plans)").all();
    const hasOwnerId = tableInfo.some(col => col.name === "owner_id");
    assert.strictEqual(hasOwnerId, true, "owner_id column must exist in plans table");
    console.log("✓ Test 1 passed: owner_id column exists.");

    // ---------------------------------------------------------
    // Test 2: New plan gets authenticated owner's ID (server-side)
    // ---------------------------------------------------------
    console.log("Test 2: Creating new plan as Owner A and verifying owner_id...");
    const createRes = await request("POST", "/api/plans", {
      token: ownerAToken,
      body: {
        name: "Netflix Premium",
        solo_price: 5000,
        price_per_seat: 1200,
        family_price: 4000,
        default_seats: 4,
        logo: "https://example.com/netflix.png",
        color: "#E50914",
        owner_id: 99999, // Should be ignored by the server!
      },
    });
    assert.strictEqual(createRes.status, 200, `Plan creation failed: ${JSON.stringify(createRes.data)}`);
    const planAId = createRes.data.id;

    const planARow = db.prepare("SELECT * FROM plans WHERE id = ?").get(planAId);
    assert.strictEqual(planARow.owner_id, ownerAId, "Plan owner_id must match authenticated user, not body parameter");
    console.log("✓ Test 2 passed: New plan received authenticated owner_id (ignoring body).");

    // Also create a Plan for Owner B and a Legacy Plan (owner_id = NULL)
    const createBRes = await request("POST", "/api/plans", {
      token: ownerBToken,
      body: {
        name: "Spotify Duo",
        solo_price: 3000,
        price_per_seat: 800,
        family_price: 2000,
        default_seats: 2,
      },
    });
    const planBId = createBRes.data.id;

    // Insert legacy plan directly with owner_id = NULL
    const legacyPlanResult = db.prepare(`
      INSERT INTO plans (name, logo, color, solo_price, price_per_seat, family_price, default_seats, owner_id)
      VALUES ('Legacy Music Plan', NULL, NULL, 200000, 50000, 150000, 4, NULL)
    `).run();
    const legacyPlanId = Number(legacyPlanResult.lastInsertRowid);

    // ---------------------------------------------------------
    // Test 3: Owner can edit their own plan
    // ---------------------------------------------------------
    console.log("Test 3: Owner A editing their own plan...");
    const editSelfRes = await request("PATCH", `/api/plans/${planAId}`, {
      token: ownerAToken,
      body: {
        name: "Netflix 4K Ultra",
        solo_price: 5500,
      },
    });
    assert.strictEqual(editSelfRes.status, 200, `Owner A edit should succeed: ${JSON.stringify(editSelfRes.data)}`);
    assert.strictEqual(editSelfRes.data.plan.name, "Netflix 4K Ultra");
    assert.strictEqual(editSelfRes.data.plan.solo_price, 5500);
    console.log("✓ Test 3 passed: Owner A successfully edited their own plan.");

    // ---------------------------------------------------------
    // Test 4: Owner cannot edit another owner's plan
    // ---------------------------------------------------------
    console.log("Test 4: Owner B attempting to edit Owner A's plan...");
    const editOtherRes = await request("PATCH", `/api/plans/${planAId}`, {
      token: ownerBToken,
      body: { name: "Hacked Netflix" },
    });
    assert.strictEqual(editOtherRes.status, 403, "Owner B must receive 403 when editing Owner A's plan");
    console.log("✓ Test 4 passed: Owner B was denied (403) editing Owner A's plan.");

    // ---------------------------------------------------------
    // Test 5: Owner cannot edit a legacy NULL-owner plan
    // ---------------------------------------------------------
    console.log("Test 5: Owner A attempting to edit legacy plan with NULL owner_id...");
    const editLegacyOwnerRes = await request("PATCH", `/api/plans/${legacyPlanId}`, {
      token: ownerAToken,
      body: { name: "Owner-Hijacked Legacy" },
    });
    assert.strictEqual(editLegacyOwnerRes.status, 403, "Owner must receive 403 when editing legacy plan with NULL owner");
    console.log("✓ Test 5 passed: Owner A was denied (403) editing legacy plan.");

    // ---------------------------------------------------------
    // Test 6: Admin can edit legacy plans
    // ---------------------------------------------------------
    console.log("Test 6: Admin editing legacy plan...");
    const editLegacyAdminRes = await request("PATCH", `/api/plans/${legacyPlanId}`, {
      token: adminToken,
      body: { name: "Legacy Music Plan (Admin Updated)" },
    });
    assert.strictEqual(editLegacyAdminRes.status, 200, `Admin should be able to edit legacy plan: ${JSON.stringify(editLegacyAdminRes.data)}`);
    assert.strictEqual(editLegacyAdminRes.data.plan.name, "Legacy Music Plan (Admin Updated)");
    console.log("✓ Test 6 passed: Admin successfully edited legacy plan.");

    // ---------------------------------------------------------
    // Test 7: Immutable id cannot be changed
    // ---------------------------------------------------------
    console.log("Test 7: Verifying immutable id cannot be changed...");
    await request("PATCH", `/api/plans/${planAId}`, {
      token: ownerAToken,
      body: { id: 77777, name: "Netflix 4K Ultra" },
    });
    const checkIdRow = db.prepare("SELECT * FROM plans WHERE id = ?").get(planAId);
    assert.ok(checkIdRow, "Plan must still exist at original id");
    assert.strictEqual(checkIdRow.id, planAId);
    const rogueIdRow = db.prepare("SELECT * FROM plans WHERE id = 77777").get();
    assert.strictEqual(rogueIdRow, undefined, "Rogue id 77777 must not exist");
    console.log("✓ Test 7 passed: Immutable id was not changed.");

    // ---------------------------------------------------------
    // Test 8: Immutable owner_id cannot be changed
    // ---------------------------------------------------------
    console.log("Test 8: Verifying immutable owner_id cannot be changed...");
    await request("PATCH", `/api/plans/${planAId}`, {
      token: ownerAToken,
      body: { owner_id: 88888, name: "Netflix 4K Ultra" },
    });
    const checkOwnerRow = db.prepare("SELECT owner_id FROM plans WHERE id = ?").get(planAId);
    assert.strictEqual(checkOwnerRow.owner_id, ownerAId, "owner_id must remain original owner");
    console.log("✓ Test 8 passed: Immutable owner_id was not changed.");

    // ---------------------------------------------------------
    // Setup for price propagation tests:
    // Create 2 groups under Plan A (Netflix, current price: ₦1,200 = 120000 kobo)
    // Create 1 group under Plan B (Spotify, current price: ₦800 = 80000 kobo)
    // ---------------------------------------------------------
    console.log("Setting up groups and memberships for price propagation...");
    // Group A1: manager is Owner A, Member 1 joins
    const g1Res = await request("POST", "/api/groups", {
      token: ownerAToken,
      body: { plan_id: planAId },
    });
    const groupA1Id = g1Res.data.id;

    // Member 1 joins Group A1
    await request("POST", `/api/groups/${groupA1Id}/join`, { token: member1Token });

    // Group A2: manager is Owner B, Member 1 ALSO joins Group A2 (for deduplication test!)
    const g2Res = await request("POST", "/api/groups", {
      token: ownerBToken,
      body: { plan_id: planAId },
    });
    const groupA2Id = g2Res.data.id;
    await request("POST", `/api/groups/${groupA2Id}/join`, { token: member1Token });

    // Group B1: manager is Owner B (Plan B), Member 2 joins
    const gBRes = await request("POST", "/api/groups", {
      token: ownerBToken,
      body: { plan_id: planBId },
    });
    const groupB1Id = gBRes.data.id;
    await request("POST", `/api/groups/${groupB1Id}/join`, { token: member2Token });

    // Capture historical wallet transactions BEFORE price update
    const historicalTxBefore = db.prepare("SELECT * FROM wallet_transactions ORDER BY id").all();
    assert.ok(historicalTxBefore.length > 0, "There should be historical transactions");

    // Verify initial group prices are 120000 kobo (Plan A) and 80000 kobo (Plan B)
    const initG1 = db.prepare("SELECT price_per_seat FROM groups WHERE id = ?").get(groupA1Id);
    const initG2 = db.prepare("SELECT price_per_seat FROM groups WHERE id = ?").get(groupA2Id);
    const initGB = db.prepare("SELECT price_per_seat FROM groups WHERE id = ?").get(groupB1Id);
    assert.strictEqual(initG1.price_per_seat, 120000);
    assert.strictEqual(initG2.price_per_seat, 120000);
    assert.strictEqual(initGB.price_per_seat, 80000);

    // ---------------------------------------------------------
    // Test 9 & 10: price_per_seat propagates to ALL existing groups for Plan A,
    // and groups belonging to another plan remain unchanged
    // ---------------------------------------------------------
    console.log("Test 9 & 10: Updating price_per_seat on Plan A from ₦1,200 to ₦1,500...");
    const priceChangeRes = await request("PATCH", `/api/plans/${planAId}`, {
      token: ownerAToken,
      body: { price_per_seat: 1500 },
    });
    assert.strictEqual(priceChangeRes.status, 200, `Plan price update failed: ${JSON.stringify(priceChangeRes.data)}`);

    const updatedG1 = db.prepare("SELECT price_per_seat FROM groups WHERE id = ?").get(groupA1Id);
    const updatedG2 = db.prepare("SELECT price_per_seat FROM groups WHERE id = ?").get(groupA2Id);
    const updatedGB = db.prepare("SELECT price_per_seat FROM groups WHERE id = ?").get(groupB1Id);

    assert.strictEqual(updatedG1.price_per_seat, 150000, "Group A1 price_per_seat must be updated to ₦1,500 (150000 kobo)");
    assert.strictEqual(updatedG2.price_per_seat, 150000, "Group A2 price_per_seat must be updated to ₦1,500 (150000 kobo)");
    console.log("✓ Test 9 passed: price_per_seat propagated to ALL existing groups for Plan A.");

    assert.strictEqual(updatedGB.price_per_seat, 80000, "Group B1 price_per_seat must remain ₦800 (80000 kobo)");
    console.log("✓ Test 10 passed: Groups belonging to another plan are unchanged.");

    // ---------------------------------------------------------
    // Test 11: New groups use the updated plan price
    // ---------------------------------------------------------
    console.log("Test 11: Creating a new group under Plan A after the price change...");
    const g3Res = await request("POST", "/api/groups", {
      token: ownerAToken,
      body: { plan_id: planAId },
    });
    const groupA3Id = g3Res.data.id;
    const newGroupRow = db.prepare("SELECT price_per_seat FROM groups WHERE id = ?").get(groupA3Id);
    assert.strictEqual(newGroupRow.price_per_seat, 150000, "Newly created group must use the updated ₦1,500 (150000 kobo) price");
    console.log("✓ Test 11 passed: New group automatically uses the updated plan price.");

    // ---------------------------------------------------------
    // Test 12: Future payment/join pricing uses the updated group price
    // ---------------------------------------------------------
    console.log("Test 12: Member 2 joining Group A1 at the new price of ₦1,500...");
    const balBefore = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(member2Id).wallet_balance;
    const joinRes = await request("POST", `/api/groups/${groupA1Id}/join`, { token: member2Token });
    assert.strictEqual(joinRes.status, 200, `Join should succeed: ${JSON.stringify(joinRes.data)}`);
    const balAfter = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(member2Id).wallet_balance;
    assert.strictEqual(balBefore - balAfter, 150000, "Member 2 must be debited exactly ₦1,500 (150000 kobo) at the new price");
    console.log("✓ Test 12 passed: Future join debits the updated group price (₦1,500).");

    // ---------------------------------------------------------
    // Test 13: User in multiple affected groups receives one notification (Deduplication)
    // ---------------------------------------------------------
    console.log("Test 13: Checking notification deduplication for Member 1 (in Group A1 and Group A2)...");
    const m1Notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ? AND text LIKE '%seat price for Netflix 4K Ultra has changed to ₦1,500%'
    `).all(member1Id);
    assert.strictEqual(m1Notifications.length, 1, `Member 1 should have received exactly 1 notification, but got ${m1Notifications.length}`);
    console.log("✓ Test 13 passed: Member 1 in multiple groups received exactly ONE deduplicated notification.");

    // ---------------------------------------------------------
    // Test 14: Changing name/logo/color without changing price does not propagate group prices or notify
    // ---------------------------------------------------------
    console.log("Test 14: Editing name and color only (no price change)...");
    const notifCountBefore = db.prepare("SELECT COUNT(*) AS count FROM notifications").get().count;
    const editMetadataRes = await request("PATCH", `/api/plans/${planAId}`, {
      token: ownerAToken,
      body: {
        name: "Netflix 4K Ultra HD",
        color: "#B81D24",
      },
    });
    assert.strictEqual(editMetadataRes.status, 200);
    const notifCountAfter = db.prepare("SELECT COUNT(*) AS count FROM notifications").get().count;
    assert.strictEqual(notifCountBefore, notifCountAfter, "No price change notifications should be sent when price did not change");
    console.log("✓ Test 14 passed: Non-price edits did not trigger price notifications.");

    // ---------------------------------------------------------
    // Test 15: Historical wallet_transactions remain value-for-value unchanged
    // ---------------------------------------------------------
    console.log("Test 15: Verifying historical wallet transactions are byte-for-byte / value-for-value unchanged...");
    for (const oldTx of historicalTxBefore) {
      const currentTx = db.prepare("SELECT * FROM wallet_transactions WHERE id = ?").get(oldTx.id);
      assert.ok(currentTx, `Historical tx ${oldTx.id} must still exist`);
      assert.strictEqual(currentTx.user_id, oldTx.user_id);
      assert.strictEqual(currentTx.type, oldTx.type);
      assert.strictEqual(currentTx.description, oldTx.description);
      assert.strictEqual(currentTx.amount, oldTx.amount);
      assert.strictEqual(currentTx.status, oldTx.status);
      assert.strictEqual(currentTx.reference, oldTx.reference);
      assert.strictEqual(currentTx.created_at, oldTx.created_at);
    }
    console.log("✓ Test 15 passed: All historical wallet transactions remain completely untouched.");

    // ---------------------------------------------------------
    // Test 16: Create and delete plan functionality still works
    // ---------------------------------------------------------
    console.log("Test 16: Testing create and delete plan functionality with owner authorization...");
    // Owner A creates a plan to delete
    const tempPlanRes = await request("POST", "/api/plans", {
      token: ownerAToken,
      body: {
        name: "Temporary Plan",
        solo_price: 1000,
        price_per_seat: 300,
        family_price: 800,
        default_seats: 4,
      },
    });
    const tempPlanId = tempPlanRes.data.id;

    // Owner B cannot delete Owner A's plan
    const deleteByB = await request("DELETE", `/api/plans/${tempPlanId}`, { token: ownerBToken });
    assert.strictEqual(deleteByB.status, 403, "Owner B must receive 403 when trying to delete Owner A's plan");

    // Owner A can delete their own plan
    const deleteByA = await request("DELETE", `/api/plans/${tempPlanId}`, { token: ownerAToken });
    assert.strictEqual(deleteByA.status, 200, `Owner A should be able to delete their plan: ${JSON.stringify(deleteByA.data)}`);

    const deletedRow = db.prepare("SELECT * FROM plans WHERE id = ?").get(tempPlanId);
    assert.strictEqual(deletedRow, undefined, "Deleted plan must no longer exist");
    console.log("✓ Test 16 passed: Create and delete plan functionality works correctly with authorization.");

    console.log("\n=======================================================");
    console.log("🎉 ALL 16 TESTS PASSED SUCCESSFULLY! 🎉");
    console.log("=======================================================\n");
  } finally {
    if (server) server.close();
    // Clean up test database
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch (_) {}
  }
}

runTests().catch(err => {
  console.error("Test failure:", err);
  process.exit(1);
});
