const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { logAudit } = require("../utils/logAudit");
const { notify } = require("../utils/notify");
const { runPaymentReminders } = require("../scripts/payment-reminders");
const router = express.Router();

router.use(requireAuth, requireAdmin);

// POST /api/admin/updates/broadcast — send a platform-wide "new update" notification to
// every user (e.g. new feature, maintenance notice, policy change). This is the "new
// updates" trigger from the notifications requirements — previously there was no way
// for admins/owner to push anything to the whole user base at once.
router.post("/updates/broadcast", (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Update text is required." });

  const trimmed = text.trim().slice(0, 500);
  const users = db.prepare("SELECT id FROM users").all();
  users.forEach(u => notify(u.id, trimmed, "update"));

  logAudit(req.userId, "update.broadcast", null, null, `Broadcast update to ${users.length} user(s): ${trimmed}`);

  res.json({ message: `Update sent to ${users.length} user(s).` });
});

// POST /api/admin/run-payment-reminders — manually trigger the daily payment-reminder
// job (see scripts/payment-reminders.js). Useful for testing, and as a target an
// external cron/uptime pinger can hit if you don't set up a native cron on the host —
// the internal setInterval scheduler in server.js only runs while the machine is awake,
// and fly.toml here has auto_stop_machines enabled.
router.post("/run-payment-reminders", async (req, res) => {
  try {
    const result = await runPaymentReminders();
    res.json({ message: "Payment reminders job completed.", ...result });
  } catch (err) {
    console.error("Manual payment reminders run failed:", err);
    res.status(500).json({ error: "Job failed — check server logs." });
  }
});

router.get("/test", (req, res) => {
  res.json({
    message: "Admin access confirmed.",
    userId: req.userId,
    role: req.userRole
  });
});

// GET /api/admin/stats — platform-wide counts for the dashboard
router.get("/stats", (req, res) => {
  const totalUsers = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  const activeGroups = db.prepare("SELECT COUNT(*) AS count FROM groups WHERE status = 'active'").get().count;

  res.json({ totalUsers, activeGroups });
});

// GET /api/admin/users — every user on the platform
router.get("/users", (req, res) => {
  const users = db
    .prepare("SELECT id, fullname, email, role, suspended, created_at FROM users ORDER BY id DESC")
    .all();
  res.json({ users });
});

// PUT /api/admin/users/:id/suspend — toggle suspended status
router.put("/users/:id/suspend", (req, res) => {
  const target = db.prepare("SELECT id, email, role, suspended FROM users WHERE id = ?").get(req.params.id);
  if (!target) {
    return res.status(404).json({ error: "User not found." });
  }
  if (target.role === "owner") {
    return res.status(403).json({ error: "Owner accounts can't be suspended." });
  }

  const newValue = target.suspended ? 0 : 1;
  db.prepare("UPDATE users SET suspended = ? WHERE id = ?").run(newValue, req.params.id);

  logAudit(
    req.userId,
    newValue ? "user.suspend" : "user.reinstate",
    "user",
    target.id,
    `${newValue ? "Suspended" : "Reinstated"} ${target.email}`
  );

  res.json({
    message: `${target.email} ${newValue ? "suspended" : "reinstated"}.`,
    suspended: !!newValue,
  });
});

// GET /api/admin/groups — every internal group, with plan/manager/seat/revenue info
router.get("/groups", (req, res) => {
  const rows = db.prepare(`
    SELECT
      g.id, g.seats_total, g.price_per_seat, g.status,
      p.name AS plan_name,
      m.fullname AS manager_name,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS seats_filled
    FROM groups g
    JOIN plans p ON p.id = g.plan_id
    JOIN users m ON m.id = g.manager_id
    ORDER BY g.created_at DESC
  `).all();

  const groups = rows.map(row => ({
    id: row.id,
    plan: row.plan_name,
    manager: row.manager_name,
    seatsFilled: row.seats_filled,
    seatsTotal: row.seats_total,
    monthlyRevenue: (row.price_per_seat * row.seats_filled) / 100,
    status: row.seats_filled >= row.seats_total ? "full" : row.status,
  }));

  res.json({ groups });
});

// GET /api/admin/transactions — platform-wide wallet activity, most recent first
router.get("/transactions", (req, res) => {
  const rows = db.prepare(`
    SELECT wt.id, wt.type, wt.description, wt.amount, wt.created_at, u.fullname AS user_name
    FROM wallet_transactions wt
    JOIN users u ON u.id = wt.user_id
    ORDER BY wt.created_at DESC
    LIMIT 200
  `).all();

  const transactions = rows.map(tx => ({
    date: tx.created_at,
    user: tx.user_name,
    type: tx.type,
    description: tx.description,
    amount: tx.amount / 100,
  }));

  res.json({ transactions });
});

// GET /api/admin/audit-log — recent admin/owner actions, newest first
router.get("/audit-log", (req, res) => {
  const rows = db.prepare(`
    SELECT al.id, al.action, al.target_type, al.target_id, al.details, al.created_at,
           u.fullname AS actor_name, u.role AS actor_role
    FROM audit_log al
    JOIN users u ON u.id = al.actor_id
    ORDER BY al.created_at DESC
    LIMIT 200
  `).all();

  const entries = rows.map(row => ({
    id: row.id,
    actor: row.actor_name,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: row.details,
    date: row.created_at,
  }));

  res.json({ entries });
});

module.exports = router;
