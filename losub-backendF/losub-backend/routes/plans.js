const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/requireAdmin");

const router = express.Router();

// GET /api/plans — public list of all subscription plans (any logged-in user)
router.get("/", requireAuth, (req, res) => {
  const plans = db.prepare("SELECT id, name, logo, color, solo_price FROM plans ORDER BY name").all();
  res.json({
    plans: plans.map(p => ({ ...p, solo_price: p.solo_price / 100 })),
  });
});

// POST /api/plans — create a new plan catalog entry (admin/owner only)
router.post("/", requireAuth, requireAdmin, (req, res) => {
  const { name, logo, color, solo_price } = req.body;

  if (!name || !solo_price) {
    return res.status(400).json({ error: "name and solo_price are required." });
  }

  const soloPriceKobo = Math.round(Number(solo_price) * 100);
  const result = db
    .prepare("INSERT INTO plans (name, logo, color, solo_price) VALUES (?, ?, ?, ?)")
    .run(name, logo || null, color || null, soloPriceKobo);

  res.json({ id: result.lastInsertRowid, message: `${name} added to the plan catalog.` });
});

// DELETE /api/plans/:id — remove a plan from the catalog (admin/owner only)
router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  const plan = db.prepare("SELECT id, name FROM plans WHERE id = ?").get(req.params.id);
  if (!plan) {
    return res.status(404).json({ error: "Plan not found." });
  }

  const activeGroups = db.prepare("SELECT COUNT(*) AS n FROM groups WHERE plan_id = ?").get(req.params.id).n;
  if (activeGroups > 0) {
    return res.status(400).json({ error: `Can't delete ${plan.name} — it has ${activeGroups} group(s) using it. Remove those first.` });
  }

  db.prepare("DELETE FROM plans WHERE id = ?").run(req.params.id);
  res.json({ message: `${plan.name} removed from the catalog.` });
});

module.exports = router;