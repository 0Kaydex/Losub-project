const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { logAudit } = require("../utils/logAudit");
const { notify } = require("../utils/notify");
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

// ---------------------------------------------------------------------------
// Support messaging — the manager <-> Losub admin/owner "direct line" thread
// for every group. Messages are wiped after 24h (see db.pruneOldMessages).
// ---------------------------------------------------------------------------

// GET /api/admin/messages/threads — one row per group that has a live support
// thread, newest activity first, with a preview of the last message.
router.get("/messages/threads", (req, res) => {
  db.pruneOldMessages();

  const rows = db.prepare(`
    SELECT g.id AS group_id, p.name AS plan_name, u.fullname AS manager_name,
           (SELECT body FROM messages WHERE group_id = g.id AND thread = 'support' ORDER BY created_at DESC LIMIT 1) AS last_body,
           (SELECT created_at FROM messages WHERE group_id = g.id AND thread = 'support' ORDER BY created_at DESC LIMIT 1) AS last_at
    FROM groups g
    JOIN plans p ON p.id = g.plan_id
    JOIN users u ON u.id = g.manager_id
    WHERE EXISTS (SELECT 1 FROM messages WHERE group_id = g.id AND thread = 'support')
    ORDER BY last_at DESC
  `).all();

  res.json({
    threads: rows.map(r => ({
      groupId: r.group_id,
      plan: r.plan_name,
      manager: r.manager_name,
      lastMessage: r.last_body,
      lastAt: r.last_at,
    })),
  });
});

// GET /api/admin/messages/:groupId — full support thread for one group
router.get("/messages/:groupId", (req, res) => {
  db.pruneOldMessages();

  const group = db.prepare(`
    SELECT g.id, p.name AS plan_name, u.fullname AS manager_name
    FROM groups g JOIN plans p ON p.id = g.plan_id JOIN users u ON u.id = g.manager_id
    WHERE g.id = ?
  `).get(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found." });

  const messages = db.prepare(
    "SELECT id, sender_id, sender_role, sender_name, body, created_at FROM messages WHERE group_id = ? AND thread = 'support' ORDER BY created_at ASC"
  ).all(req.params.groupId);

  res.json({ plan: group.plan_name, manager: group.manager_name, messages, expiresAfterHours: 24 });
});

// POST /api/admin/messages/:groupId  { body: string }
router.post("/messages/:groupId", (req, res) => {
  db.pruneOldMessages();

  const body = (req.body.body || "").trim();
  if (!body) return res.status(400).json({ error: "Message can't be empty." });
  if (body.length > 1000) return res.status(400).json({ error: "Message is too long (max 1000 characters)." });

  const group = db.prepare("SELECT id, manager_id FROM groups WHERE id = ?").get(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found." });

  const sender = db.prepare("SELECT fullname FROM users WHERE id = ?").get(req.userId);

  const result = db.prepare(
    "INSERT INTO messages (group_id, thread, sender_id, sender_role, sender_name, body) VALUES (?, 'support', ?, 'admin', ?, ?)"
  ).run(req.params.groupId, req.userId, sender.fullname, body);

  const saved = db.prepare(
    "SELECT id, sender_id, sender_role, sender_name, body, created_at FROM messages WHERE id = ?"
  ).get(result.lastInsertRowid);

  notify(group.manager_id, `Losub support: ${body.slice(0, 80)}`, "group_message", `messages.html?group=${req.params.groupId}&thread=support`);

  res.status(201).json({ message: saved });
});

module.exports = router;
