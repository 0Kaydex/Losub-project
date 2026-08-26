const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { logAudit } = require("../utils/logAudit");
const router = express.Router();

router.use(requireAuth, requireAdmin);

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
