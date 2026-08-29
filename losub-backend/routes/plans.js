const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { logAudit } = require("../utils/logAudit");

const router = express.Router();

// GET /api/plans — public list of all subscription plans (any logged-in user)
router.get("/", requireAuth, (req, res) => {
  const plans = db.prepare("SELECT id, name, logo, color, solo_price, group_price, price_per_seat FROM plans ORDER BY name").all();
  res.json({
    plans: plans.map(p => ({
      ...p,
      solo_price: p.solo_price / 100,
      group_price: p.group_price != null ? p.group_price / 100 : null,
      price_per_seat: p.price_per_seat != null ? p.price_per_seat / 100 : null,
    })),
  });
});

// POST /api/plans — create a new plan catalog entry (admin/owner only)
router.post("/", requireAuth, requireAdmin, (req, res) => {
  const { name, logo, color, solo_price, group_price, price_per_seat } = req.body;

  if (!name || !solo_price || !price_per_seat) {
    return res.status(400).json({ error: "name, solo_price, and price_per_seat are required." });
  }

  const soloPriceKobo = Math.round(Number(solo_price) * 100);
  const pricePerSeatKobo = Math.round(Number(price_per_seat) * 100);
  const groupPriceKobo = group_price ? Math.round(Number(group_price) * 100) : null;

  const result = db
    .prepare("INSERT INTO plans (name, logo, color, solo_price, group_price, price_per_seat) VALUES (?, ?, ?, ?, ?, ?)")
    .run(name, logo || null, color || null, soloPriceKobo, groupPriceKobo, pricePerSeatKobo);

  logAudit(
    req.userId,
    "plan.create",
    "plan",
    result.lastInsertRowid,
    `Added "${name}" (solo ₦${solo_price}, per-seat ₦${price_per_seat}${group_price ? `, group cost ₦${group_price}` : ""})`
  );

  res.json({ id: result.lastInsertRowid, message: `${name} added to the plan catalog.` });
});
// PUT /api/plans/:id — edit an existing plan's name/logo/color/prices (admin/owner only).
// Note: this only changes the catalog price for FUTURE groups. Groups already created
// under this plan keep the price_per_seat they were created with — editing a typo here
// won't silently change what existing members are already paying.
router.put("/:id", requireAuth, requireAdmin, (req, res) => {
  const plan = db.prepare("SELECT id, name, solo_price, price_per_seat FROM plans WHERE id = ?").get(req.params.id);
  if (!plan) return res.status(404).json({ error: "Plan not found." });

  const { name, logo, color, solo_price, group_price, price_per_seat } = req.body;
  if (!name || !solo_price || !price_per_seat) {
    return res.status(400).json({ error: "name, solo_price, and price_per_seat are required." });
  }

  const soloPriceKobo = Math.round(Number(solo_price) * 100);
  const pricePerSeatKobo = Math.round(Number(price_per_seat) * 100);
  const groupPriceKobo = group_price ? Math.round(Number(group_price) * 100) : null;

  db.prepare("UPDATE plans SET name = ?, logo = ?, color = ?, solo_price = ?, group_price = ?, price_per_seat = ? WHERE id = ?")
    .run(name, logo || null, color || null, soloPriceKobo, groupPriceKobo, pricePerSeatKobo, req.params.id);

  logAudit(
    req.userId,
    "plan.update",
    "plan",
    plan.id,
    `Updated "${plan.name}": solo ₦${plan.solo_price / 100} → ₦${solo_price}, per-seat ₦${plan.price_per_seat != null ? plan.price_per_seat / 100 : "—"} → ₦${price_per_seat}`
  );

  res.json({ message: `${name} updated.` });
});

// delete /api/plans/:id — delete a plan catalog entry (admin/owner only)

router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  const plan = db.prepare("SELECT id, name FROM plans WHERE id = ?").get(req.params.id);
  if (!plan) return res.status(404).json({ error: "Plan not found." });

  const groupIds = db.prepare("SELECT id FROM groups WHERE plan_id = ?").all(req.params.id).map(g => g.id);

  if (groupIds.length > 0 && req.query.force !== "true") {
    return res.status(400).json({
      error: `${plan.name} has ${groupIds.length} group(s) using it. Deleting will remove those groups and kick out all their members — no refunds happen automatically.`,
      groupCount: groupIds.length,
    });
  }

  if (groupIds.length > 0) {
    const placeholders = groupIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM group_members WHERE group_id IN (${placeholders})`).run(...groupIds);
    db.prepare(`DELETE FROM groups WHERE id IN (${placeholders})`).run(...groupIds);
  }

  db.prepare("DELETE FROM plans WHERE id = ?").run(req.params.id);

  logAudit(req.userId, "plan.delete", "plan", plan.id, `Deleted "${plan.name}" and ${groupIds.length} linked group(s)`);

  res.json({ message: `${plan.name} and ${groupIds.length} linked group(s) deleted.` });
});

module.exports = router;