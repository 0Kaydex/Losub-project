const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notify } = require("../utils/notify");

const router = express.Router();
router.use(requireAuth);

// ============================================================================
// GROUP THREAD — manager <-> members of one specific group. This is the "chain
// of communication" between a manager and the people in their group: managers can
// post announcements, members can reply, everyone in the group sees the same thread.
// ============================================================================

function assertGroupMember(groupId, userId) {
  const group = db.prepare("SELECT id, manager_id FROM groups WHERE id = ?").get(groupId);
  if (!group) return { error: 404, message: "Group not found." };

  const isManager = group.manager_id === userId;
  const membership = db.prepare(
    "SELECT id FROM group_members WHERE group_id = ? AND user_id = ?"
  ).get(groupId, userId);

  if (!isManager && !membership) return { error: 403, message: "You're not part of this group." };
  return { group, isManager };
}

// GET /api/messages/group/:groupId — full message history for a group's thread
router.get("/group/:groupId", (req, res) => {
  const check = assertGroupMember(req.params.groupId, req.userId);
  if (check.error) return res.status(check.error).json({ error: check.message });

  const messages = db.prepare(`
    SELECT m.id, m.sender_id, m.sender_role, m.text, m.created_at, u.fullname AS sender_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.thread_type = 'group' AND m.group_id = ?
    ORDER BY m.created_at ASC
    LIMIT 200
  `).all(req.params.groupId);

  res.json({ messages });
});

// POST /api/messages/group/:groupId — manager or member posts into the group thread.
// Everyone else currently in the group gets a notification.
router.post("/group/:groupId", (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Message can't be empty." });

  const check = assertGroupMember(req.params.groupId, req.userId);
  if (check.error) return res.status(check.error).json({ error: check.message });

  const trimmed = text.trim().slice(0, 2000);
  const senderRole = check.isManager ? "manager" : "member";

  const result = db.prepare(
    "INSERT INTO messages (thread_type, group_id, sender_id, sender_role, text) VALUES ('group', ?, ?, ?, ?)"
  ).run(req.params.groupId, req.userId, senderRole, trimmed);

  const sender = db.prepare("SELECT fullname FROM users WHERE id = ?").get(req.userId);

  // Notify everyone else in the group (the manager always has their own group_members
  // row, so this alone covers manager + every member without duplicates).
  const recipients = db.prepare(
    "SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?"
  ).all(req.params.groupId, req.userId);

  const preview = trimmed.length > 80 ? trimmed.slice(0, 77) + "…" : trimmed;
  recipients.forEach(({ user_id: userId }) => {
    notify(userId, `${sender.fullname} (${senderRole}): ${preview}`, "message", null, Number(req.params.groupId));
  });

  res.json({
    message: {
      id: result.lastInsertRowid,
      sender_id: req.userId,
      sender_role: senderRole,
      sender_name: sender.fullname,
      text: trimmed,
      created_at: new Date().toISOString(),
    },
  });
});

// ============================================================================
// MANAGER <-> ADMIN/OWNER THREAD — one thread per manager. Managers can message
// admins/owner (e.g. disputes, check-ins), and admins/owner can message a manager
// back. This previously didn't exist at all — admin-messaging.html was mock data only.
// ============================================================================

function isAdminOrOwner(userId) {
  const user = db.prepare("SELECT role FROM users WHERE id = ?").get(userId);
  return user && (user.role === "admin" || user.role === "owner");
}

// GET /api/messages/manager — the logged-in manager's own thread with admin/owner
router.get("/manager", (req, res) => {
  const messages = db.prepare(`
    SELECT m.id, m.sender_id, m.sender_role, m.text, m.created_at, u.fullname AS sender_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.thread_type = 'manager_admin' AND m.manager_id = ?
    ORDER BY m.created_at ASC
    LIMIT 200
  `).all(req.userId);

  res.json({ messages });
});

// POST /api/messages/manager — the logged-in manager sends a message into their own
// thread with admin/owner. Notifies every admin/owner on the platform.
router.post("/manager", (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Message can't be empty." });

  const trimmed = text.trim().slice(0, 2000);
  const result = db.prepare(
    "INSERT INTO messages (thread_type, manager_id, sender_id, sender_role, text) VALUES ('manager_admin', ?, ?, 'manager', ?)"
  ).run(req.userId, req.userId, trimmed);

  const sender = db.prepare("SELECT fullname FROM users WHERE id = ?").get(req.userId);
  const preview = trimmed.length > 80 ? trimmed.slice(0, 77) + "…" : trimmed;

  const admins = db.prepare("SELECT id FROM users WHERE role IN ('admin', 'owner')").all();
  admins.forEach(a => notify(a.id, `${sender.fullname} (manager): ${preview}`, "message"));

  res.json({
    message: {
      id: result.lastInsertRowid,
      sender_id: req.userId,
      sender_role: "manager",
      sender_name: sender.fullname,
      text: trimmed,
      created_at: new Date().toISOString(),
    },
  });
});

// GET /api/messages/managers — admin/owner only: list of every manager who has an
// active group, each with a preview of their thread, for the thread-list sidebar.
router.get("/managers", (req, res) => {
  if (!isAdminOrOwner(req.userId)) return res.status(403).json({ error: "Admin access required." });

  const managers = db.prepare(`
    SELECT DISTINCT u.id, u.fullname, u.email
    FROM users u
    JOIN groups g ON g.manager_id = u.id
    WHERE g.status = 'active'
    ORDER BY u.fullname
  `).all();

  const threads = managers.map(m => {
    const last = db.prepare(`
      SELECT text, sender_role, created_at FROM messages
      WHERE thread_type = 'manager_admin' AND manager_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(m.id);
    const unread = 0; // read-state per manager not tracked yet — always shown, no badge logic
    return {
      managerId: m.id,
      name: m.fullname,
      email: m.email,
      lastMessage: last ? last.text : null,
      lastSenderRole: last ? last.sender_role : null,
      lastMessageAt: last ? last.created_at : null,
      unread,
    };
  });

  res.json({ threads });
});

// GET /api/messages/manager/:managerId — admin/owner only: view one manager's thread
router.get("/manager/:managerId", (req, res) => {
  if (!isAdminOrOwner(req.userId)) return res.status(403).json({ error: "Admin access required." });

  const manager = db.prepare("SELECT id, fullname, email FROM users WHERE id = ?").get(req.params.managerId);
  if (!manager) return res.status(404).json({ error: "Manager not found." });

  const messages = db.prepare(`
    SELECT m.id, m.sender_id, m.sender_role, m.text, m.created_at, u.fullname AS sender_name
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.thread_type = 'manager_admin' AND m.manager_id = ?
    ORDER BY m.created_at ASC
    LIMIT 200
  `).all(req.params.managerId);

  res.json({ manager, messages });
});

// POST /api/messages/manager/:managerId — admin/owner sends a message into that
// manager's thread. Notifies the manager.
router.post("/manager/:managerId", (req, res) => {
  if (!isAdminOrOwner(req.userId)) return res.status(403).json({ error: "Admin access required." });

  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Message can't be empty." });

  const manager = db.prepare("SELECT id, fullname FROM users WHERE id = ?").get(req.params.managerId);
  if (!manager) return res.status(404).json({ error: "Manager not found." });

  const trimmed = text.trim().slice(0, 2000);
  const senderRole = db.prepare("SELECT role FROM users WHERE id = ?").get(req.userId).role; // 'admin' | 'owner'

  const result = db.prepare(
    "INSERT INTO messages (thread_type, manager_id, sender_id, sender_role, text) VALUES ('manager_admin', ?, ?, ?, ?)"
  ).run(req.params.managerId, req.userId, senderRole, trimmed);

  const sender = db.prepare("SELECT fullname FROM users WHERE id = ?").get(req.userId);
  const preview = trimmed.length > 80 ? trimmed.slice(0, 77) + "…" : trimmed;
  notify(manager.id, `${sender.fullname} (Losub ${senderRole}): ${preview}`, "message");

  res.json({
    message: {
      id: result.lastInsertRowid,
      sender_id: req.userId,
      sender_role: senderRole,
      sender_name: sender.fullname,
      text: trimmed,
      created_at: new Date().toISOString(),
    },
  });
});

module.exports = router;
