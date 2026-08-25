const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notify } = require("../utils/notify");

const router = express.Router();
router.use(requireAuth);

// Shared helper — shape a raw group+plan row into what the frontend expects
function formatGroup(row, userRoleInGroup, extra = {}) {
  return {
    id: row.group_id,
    planId: row.plan_id,
    plan: row.plan_name,
    logo: row.logo,
    color: row.color,
    soloPrice: row.solo_price / 100,
    yourPrice: row.price_per_seat / 100,
    seatsTotal: row.seats_total,
    seatsFilled: row.seats_filled,
    manager: row.manager_name,
    role: userRoleInGroup,
    ...extra,
  };
}

// GET /api/groups/mine — groups the logged-in user belongs to
router.get("/mine", (req, res) => {
  const rows = db.prepare(`
    SELECT
      g.id AS group_id, g.seats_total, g.price_per_seat, g.status,
      p.name AS plan_name, p.logo, p.color, p.solo_price,
      m.fullname AS manager_name,
      gm.role AS member_role, gm.payment_status, gm.next_payment_date,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS seats_filled
    FROM group_members gm
    JOIN groups g ON g.id = gm.group_id
    JOIN plans p ON p.id = g.plan_id
    JOIN users m ON m.id = g.manager_id
    WHERE gm.user_id = ?
    ORDER BY gm.joined_at DESC
  `).all(req.userId);

  const groups = rows.map(row => formatGroup(row, row.member_role, {
    paymentStatus: row.payment_status,
    nextPaymentDate: row.next_payment_date,
  }));

  res.json({ groups });
});

// GET /api/groups/browse — open groups with free seats, excluding ones you're already in
router.get("/browse", (req, res) => {
 const rows = db.prepare(`
    SELECT
      g.id AS group_id, g.plan_id, g.seats_total, g.price_per_seat, g.status,
      p.name AS plan_name, p.logo, p.color, p.solo_price,
      m.fullname AS manager_name,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS seats_filled
    FROM groups g
    JOIN plans p ON p.id = g.plan_id
    JOIN users m ON m.id = g.manager_id
    WHERE g.status = 'active'
      AND g.id NOT IN (SELECT group_id FROM group_members WHERE user_id = ?)
    ORDER BY g.created_at DESC
  `).all(req.userId);

  const openGroups = rows
    .filter(r => r.seats_filled < r.seats_total)
    .map(row => formatGroup(row, null));

  res.json({ groups: openGroups });
});

// GET /api/groups/:id — details for a group you belong to (member or manager)
router.get("/:id", (req, res) => {
  const group = db.prepare(`
    SELECT g.id, g.seats_total, g.price_per_seat, g.status, g.access_link,
           p.name AS plan_name, p.logo, p.color, p.solo_price,
           m.fullname AS manager_name, m.id AS manager_id
    FROM groups g
    JOIN plans p ON p.id = g.plan_id
    JOIN users m ON m.id = g.manager_id
    WHERE g.id = ?
  `).get(req.params.id);

  if (!group) return res.status(404).json({ error: "Group not found." });

  const membership = db.prepare(
    "SELECT role, payment_status, next_payment_date FROM group_members WHERE group_id = ? AND user_id = ?"
  ).get(req.params.id, req.userId);

  if (!membership) return res.status(403).json({ error: "You're not part of this group." });

  const seatsFilled = db.prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?").get(req.params.id).n;

  res.json({
    id: group.id,
    plan: group.plan_name,
    logo: group.logo,
    color: group.color,
    seatsTotal: group.seats_total,
    seatsFilled,
    yourPrice: group.price_per_seat / 100,
    soloPrice: group.solo_price / 100,
    manager: group.manager_name,
    yourRole: membership.role,
    paymentStatus: membership.payment_status,
    nextPaymentDate: membership.next_payment_date,
    accessLink: group.access_link || null,
  });
});

// PUT /api/groups/:id/access-link — manager sets/updates the shared account's access link/credentials.
// Members see this on their group page once it's set; everyone already in the group gets notified.
router.put("/:id/access-link", (req, res) => {
  const { link } = req.body;
  if (!link || !link.trim()) {
    return res.status(400).json({ error: "A link is required." });
  }

  const group = db.prepare("SELECT manager_id FROM groups WHERE id = ?").get(req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found." });
  if (group.manager_id !== req.userId) {
    return res.status(403).json({ error: "Only the group manager can set the access link." });
  }

  const trimmedLink = link.trim();
  db.prepare("UPDATE groups SET access_link = ? WHERE id = ?").run(trimmedLink, req.params.id);

  const members = db.prepare(
    "SELECT user_id FROM group_members WHERE group_id = ? AND user_id != ?"
  ).all(req.params.id, req.userId);
  members.forEach(m => notify(m.user_id, "Your group manager shared/updated the account access link.", "group_link"));

  res.json({ message: "Access link sent to the group.", accessLink: trimmedLink });
});

// GET /api/groups/:id/members — manager-only roster
router.get("/:id/members", (req, res) => {
  const group = db.prepare("SELECT manager_id FROM groups WHERE id = ?").get(req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found." });
  if (group.manager_id !== req.userId) {
    return res.status(403).json({ error: "Only the group manager can view this." });
  }

  const members = db.prepare(`
    SELECT u.id AS user_id, u.fullname, u.email, gm.role, gm.payment_status, gm.joined_at
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.joined_at
  `).all(req.params.id);

  res.json({ members });
});

// DELETE /api/groups/:id/members/:userId — manager removes a member
router.delete("/:id/members/:userId", (req, res) => {
  const group = db.prepare("SELECT manager_id FROM groups WHERE id = ?").get(req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found." });
  if (group.manager_id !== req.userId) {
    return res.status(403).json({ error: "Only the group manager can remove members." });
  }
  if (String(req.params.userId) === String(group.manager_id)) {
    return res.status(400).json({ error: "The manager can't remove themselves from their own group." });
  }

  const result = db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(req.params.id, req.params.userId);
  if (result.changes === 0) return res.status(404).json({ error: "That member isn't in this group." });

  res.json({ message: "Member removed." });
  notify(req.params.userId, "You were removed from a group.", "group");
});

// POST /api/groups/:id/leave — a member leaves (managers can't leave their own group yet)
router.post("/:id/leave", (req, res) => {
  const group = db.prepare("SELECT manager_id FROM groups WHERE id = ?").get(req.params.id);
  if (!group) return res.status(404).json({ error: "Group not found." });
  if (group.manager_id === req.userId) {
    return res.status(400).json({ error: "Managers can't leave their own group — that feature isn't built yet." });
  }

  const result = db.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: "You're not in this group." });

  res.json({ message: "You left the group." });
});

// POST /api/groups — create a new group as its manager
router.post("/", (req, res) => {
  const { plan_id, seats_total, price_per_seat } = req.body;

  if (!plan_id || !seats_total || !price_per_seat) {
    return res.status(400).json({ error: "plan_id, seats_total, and price_per_seat are required." });
  }

  const plan = db.prepare("SELECT id FROM plans WHERE id = ?").get(plan_id);
  if (!plan) return res.status(404).json({ error: "Plan not found." });

  const priceKobo = Math.round(Number(price_per_seat) * 100);

  const result = db.prepare(
    "INSERT INTO groups (plan_id, manager_id, seats_total, price_per_seat) VALUES (?, ?, ?, ?)"
  ).run(plan_id, req.userId, seats_total, priceKobo);

  // Manager automatically takes the first seat, marked as paid (they're not paying themselves).
  db.prepare(
    "INSERT INTO group_members (group_id, user_id, role, payment_status) VALUES (?, ?, 'manager', 'paid')"
  ).run(result.lastInsertRowid, req.userId);

  res.json({ id: result.lastInsertRowid, message: "Group created." });
});

// POST /api/groups/:id/join — take a seat, deducting price_per_seat from wallet
router.post("/:id/join", (req, res) => {
  const groupId = req.params.id;

  const group = db.prepare("SELECT * FROM groups WHERE id = ?").get(groupId);
  if (!group || group.status !== "active") {
    return res.status(404).json({ error: "Group not found or no longer open." });
  }

  const alreadyIn = db.prepare("SELECT id FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, req.userId);
  if (alreadyIn) {
    return res.status(400).json({ error: "You're already in this group." });
  }

  const seatsFilled = db.prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?").get(groupId).n;
  if (seatsFilled >= group.seats_total) {
    return res.status(400).json({ error: "This group is full." });
  }

  const user = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(req.userId);
  if (user.wallet_balance < group.price_per_seat) {
    return res.status(400).json({ error: "Insufficient wallet balance. Fund your wallet first." });
  }

  const plan = db.prepare("SELECT name FROM plans WHERE id = ?").get(group.plan_id);

  // Deduct + join + log transaction together — all or nothing in effect since node:sqlite
  // runs synchronously and any thrown error here would leave earlier statements applied,
  // so we order deduction first and only join after it succeeds.
  db.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?").run(group.price_per_seat, req.userId);
  db.prepare(
    "INSERT INTO group_members (group_id, user_id, role, payment_status) VALUES (?, ?, 'member', 'paid')"
  ).run(groupId, req.userId);
  db.prepare(
    "INSERT INTO wallet_transactions (user_id, type, description, amount, status) VALUES (?, 'plan_payment', ?, ?, 'success')"
  ).run(req.userId, `${plan.name} seat payment`, -group.price_per_seat);

  notify(req.userId, `You joined the ${plan.name} group.`, "group");
  notify(group.manager_id, `Someone joined your ${plan.name} group.`, "group");

  res.json({ message: `You joined the ${plan.name} group.` });

});

module.exports = router;