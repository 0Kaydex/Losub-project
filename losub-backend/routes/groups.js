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

// Groups always split into this many seats. Kept server-side (not trusted from the client)
// so the manager's price_per_seat is always computed the same way as everyone else's.
const SEATS_PER_GROUP = 4;

// POST /api/groups — become the account manager for a plan (creates its group + pays your
// own seat, exactly like a member would when they join). Eligibility, pricing, and the wallet
// deduction are all decided here, server-side — never trust plan_id-adjacent numbers the
// client sends, and never create a group before the payment for it is confirmed to succeed.
router.post("/", (req, res) => {
  const { plan_id } = req.body;

  if (!plan_id) {
    return res.status(400).json({ error: "plan_id is required." });
  }

  const plan = db.prepare("SELECT id, name, solo_price FROM plans WHERE id = ?").get(plan_id);
  if (!plan) return res.status(404).json({ error: "Plan not found." });

  // Eligibility: you can't become manager of a plan you already manage an active group for.
  const alreadyManaging = db.prepare(`
    SELECT g.id FROM groups g
    WHERE g.plan_id = ? AND g.manager_id = ? AND g.status = 'active'
  `).get(plan_id, req.userId);
  if (alreadyManaging) {
    return res.status(400).json({ error: "You're already the manager of a group for this plan." });
  }

  // Eligibility / race guard: if an open group with free seats already exists for this plan
  // (e.g. someone else became manager a moment ago, or two tabs raced each other), there's
  // nothing to create — the user should join that one instead of us creating a duplicate.
  const openGroup = db.prepare(`
    SELECT g.id, g.seats_total, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS seats_filled
    FROM groups g
    WHERE g.plan_id = ? AND g.status = 'active'
  `).all(plan_id).find(g => g.seats_filled < g.seats_total);
  if (openGroup) {
    return res.status(409).json({ error: "A group for this plan just opened up — join it instead of starting a new one.", groupId: openGroup.id });
  }

  const priceKobo = Math.round(plan.solo_price / SEATS_PER_GROUP);

  // Wallet balance verification — the manager pays their own seat up front, same as any
  // member joining a group does. Checked before touching anything else.
  const user = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(req.userId);
  if (user.wallet_balance < priceKobo) {
    return res.status(400).json({ error: "Insufficient wallet balance to become manager. Fund your wallet first." });
  }

  // Everything below must happen together: create the group, seat the manager, and deduct
  // payment — or none of it does. node:sqlite runs synchronously on a single connection, so
  // wrapping in BEGIN/COMMIT with a rollback on any failure gives us that atomicity; nothing
  // is deducted unless the group and membership rows both land.
  let groupId;
  try {
    db.exec("BEGIN");

    const result = db.prepare(
      "INSERT INTO groups (plan_id, manager_id, seats_total, price_per_seat) VALUES (?, ?, ?, ?)"
    ).run(plan_id, req.userId, SEATS_PER_GROUP, priceKobo);
    groupId = result.lastInsertRowid;

    // Manager takes the first seat, and pays for it — matches "Losub handles all billing;
    // you never collect payments" from the offer terms: managers pay in the same way members do.
    db.prepare(
      "INSERT INTO group_members (group_id, user_id, role, payment_status) VALUES (?, ?, 'manager', 'paid')"
    ).run(groupId, req.userId);

    db.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?").run(priceKobo, req.userId);
    db.prepare(
      "INSERT INTO wallet_transactions (user_id, type, description, amount, status) VALUES (?, 'plan_payment', ?, ?, 'success')"
    ).run(req.userId, `${plan.name} — became account manager`, -priceKobo);

    db.exec("COMMIT");
  } catch (txErr) {
    db.exec("ROLLBACK");
    console.error("Group creation failed, rolled back (nothing was deducted):", txErr);
    return res.status(500).json({ error: "Couldn't create the group. Your wallet was not charged. Please try again." });
  }

  notify(req.userId, `You're now the account manager for ${plan.name}.`, "group");

  // Return the fully-formed group (shaped like GET /api/groups/mine's rows) plus the new
  // balance, so the frontend can drop it straight into the dashboard's in-memory state
  // instead of waiting on a fresh GET — that's what makes it show up without a manual refresh.
  const updatedUser = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(req.userId);
  const row = db.prepare(`
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
    WHERE g.id = ? AND gm.user_id = ?
  `).get(groupId, req.userId);

  const group = formatGroup(row, row.member_role, {
    paymentStatus: row.payment_status,
    nextPaymentDate: row.next_payment_date,
  });

  res.json({ id: groupId, message: "Group created.", group, balance: updatedUser.wallet_balance / 100 });
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

  // Deduct + join + log transaction together, wrapped in a real transaction. Without an
  // explicit BEGIN/COMMIT, node:sqlite auto-commits each statement individually — so if the
  // membership insert below failed on its own (e.g. two tabs racing to take the last seat,
  // tripping the group_members unique index) after the deduction had already run, the user
  // would lose money with no seat to show for it. Wrapping it means either both happen or
  // neither does.
  try {
    db.exec("BEGIN");
    db.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?").run(group.price_per_seat, req.userId);
    db.prepare(
      "INSERT INTO group_members (group_id, user_id, role, payment_status) VALUES (?, ?, 'member', 'paid')"
    ).run(groupId, req.userId);
    db.prepare(
      "INSERT INTO wallet_transactions (user_id, type, description, amount, status) VALUES (?, 'plan_payment', ?, ?, 'success')"
    ).run(req.userId, `${plan.name} seat payment`, -group.price_per_seat);
    db.exec("COMMIT");
  } catch (txErr) {
    db.exec("ROLLBACK");
    console.error("Group join failed, rolled back (nothing was deducted):", txErr);
    // The most common real cause here is losing a race for the last seat.
    return res.status(409).json({ error: "That seat was just taken — try another group. Your wallet was not charged." });
  }

  notify(req.userId, `You joined the ${plan.name} group.`, "group");
  notify(group.manager_id, `Someone joined your ${plan.name} group.`, "group");

  res.json({ message: `You joined the ${plan.name} group.` });

});

module.exports = router;