const db = require("../db");

// Records an admin/owner action to the audit log. Failures here are logged but never
// thrown — an audit-log write must never break the action it's recording.
function logAudit(actorId, action, targetType, targetId, details) {
  try {
    db.prepare(
      "INSERT INTO audit_log (actor_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)"
    ).run(actorId, action, targetType || null, targetId || null, details || null);
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}

module.exports = { logAudit };
