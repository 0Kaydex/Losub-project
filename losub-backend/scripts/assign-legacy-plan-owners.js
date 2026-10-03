const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const OWNER_ID = 1;
const LEGACY_PLANS = [
  { id: 10, name: "Spotify" },
  { id: 12, name: "YouTube" },
];

function assignLegacyPlanOwners(db) {
  db.exec("BEGIN IMMEDIATE");

  try {
    const owner = db.prepare("SELECT id, role FROM users WHERE id = ?").get(OWNER_ID);
    if (!owner || owner.role !== "owner") {
      throw new Error(`User ${OWNER_ID} must exist and have the owner role.`);
    }

    const selectPlan = db.prepare("SELECT id, name, owner_id FROM plans WHERE id = ?");
    const plans = LEGACY_PLANS.map(expected => {
      const plan = selectPlan.get(expected.id);
      if (!plan || plan.name !== expected.name) {
        throw new Error(`Plan ${expected.id} must exist with the exact name "${expected.name}".`);
      }
      if (plan.owner_id !== null && plan.owner_id !== OWNER_ID) {
        throw new Error(`Plan ${expected.id} is already assigned to another owner.`);
      }
      return plan;
    });

    const assignOwner = db.prepare(`
      UPDATE plans
      SET owner_id = ?
      WHERE id = ? AND name = ? AND owner_id IS NULL
    `);

    for (const plan of plans) {
      if (plan.owner_id === null) {
        const result = assignOwner.run(OWNER_ID, plan.id, plan.name);
        if (Number(result.changes) !== 1) {
          throw new Error(`Plan ${plan.id} changed while ownership was being assigned.`);
        }
      }
    }

    const assignedPlans = LEGACY_PLANS.map(expected => selectPlan.get(expected.id));
    if (assignedPlans.some(plan => !plan || plan.owner_id !== OWNER_ID)) {
      throw new Error("Legacy plan ownership verification failed.");
    }

    db.exec("COMMIT");
    return assignedPlans;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}

module.exports = { assignLegacyPlanOwners };

if (require.main === module) {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

  const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, "..", "losub.db"));
  if (!fs.existsSync(dbPath)) {
    console.error(`Database file does not exist: ${dbPath}`);
    process.exitCode = 1;
  } else {
    const db = new DatabaseSync(dbPath);
    try {
      const plans = assignLegacyPlanOwners(db);
      console.log(`Assigned legacy plan ownership in ${dbPath}:`);
      for (const plan of plans) {
        console.log(`- ${plan.name} (ID ${plan.id}) -> owner ${plan.owner_id}`);
      }
    } catch (error) {
      console.error(`Legacy plan ownership migration aborted: ${error.message}`);
      process.exitCode = 1;
    } finally {
      db.close();
    }
  }
}