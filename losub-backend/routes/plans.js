const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/requireAdmin");
const { logAudit } = require("../utils/logAudit");

const router = express.Router();

// GET /api/plans — list of subscription plans. Everyone signed in gets pricing
// they need to shop and join (solo price, seat price, seat count). Only
// admins/owners additionally see the cost basis and margin — that's Losub's
// business data, not something members or managers should see.
router.get("/", requireAuth, (req, res) => {
  const isPrivileged = req.role === "admin" || req.role === "owner";

  const plans = db.prepare(
    "SELECT id, name, logo, color, solo_price, price_per_seat, family_price, default_seats FROM plans ORDER BY name"
  ).all();

  res.json({
    plans: plans.map(p => {
      const base = {
        id: p.id,
        name: p.name,
        logo: p.logo,
        color: p.color,
        solo_price: p.solo_price / 100,
        price_per_seat: p.price_per_seat != null ? p.price_per_seat / 100 : null,
        default_seats: p.default_seats,
      };
      if (!isPrivileged) return base;

      const familyPrice = p.family_price != null ? p.family_price / 100 : null;
      const margin =
        p.price_per_seat != null && familyPrice != null
          ? Math.round((p.price_per_seat / 100) * p.default_seats - familyPrice)
          : null;

      return { ...base, family_price: familyPrice, margin };
    }),
  });
});

// POST /api/plans — create a new plan catalog entry (admin/owner only)
router.post("/", requireAuth, requireAdmin, (req, res) => {
  const { name, logo, color, solo_price, price_per_seat, family_price, default_seats } = req.body;

  if (!name || !solo_price || !price_per_seat || !family_price) {
    return res.status(400).json({
      error: "name, solo_price, price_per_seat, and family_price are all required.",
    });
  }

  const soloPriceKobo = Math.round(Number(solo_price) * 100);
  const pricePerSeatKobo = Math.round(Number(price_per_seat) * 100);
  const familyPriceKobo = Math.round(Number(family_price) * 100);
  const seats = Number(default_seats) > 0 ? Math.round(Number(default_seats)) : 4;

  const result = db
    .prepare(
      "INSERT INTO plans (name, logo, color, solo_price, price_per_seat, family_price, default_seats) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(name, logo || null, color || null, soloPriceKobo, pricePerSeatKobo, familyPriceKobo, seats);

  const margin = pricePerSeatKobo * seats - familyPriceKobo;

  logAudit(
    req.userId,
    "plan.create",
    "plan",
    result.lastInsertRowid,
    `Added "${name}" (₦${price_per_seat}/seat × ${seats} seats, ₦${family_price} family cost, ₦${(margin / 100).toLocaleString()} margin/mo)`
  );

  res.json({ id: result.lastInsertRowid, message: `${name} added to the plan catalog.` });
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