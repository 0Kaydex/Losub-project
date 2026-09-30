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
    "SELECT id, name, logo, color, solo_price, price_per_seat, family_price, default_seats, owner_id FROM plans ORDER BY name"
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

      return { ...base, family_price: familyPrice, margin, owner_id: p.owner_id ?? null };
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

  // owner_id must strictly come from the authenticated user on the server
  const ownerId = req.userId;

  const result = db
    .prepare(
      "INSERT INTO plans (name, logo, color, solo_price, price_per_seat, family_price, default_seats, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(name, logo || null, color || null, soloPriceKobo, pricePerSeatKobo, familyPriceKobo, seats, ownerId);

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

// PATCH /api/plans/:id — update an existing plan and propagate price changes (admin/owner)
router.patch("/:id", requireAuth, requireAdmin, (req, res) => {
  const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(req.params.id);
  if (!plan) return res.status(404).json({ error: "Plan not found." });

  // Authorization rules:
  // - admin may edit any plan
  // - owner may only edit plans where plan.owner_id === req.userId
  // - owner cannot edit another owner's plan (403)
  // - owner cannot edit a legacy NULL-owner plan (403)
  if (req.userRole !== "admin") {
    if (plan.owner_id == null) {
      return res.status(403).json({ error: "You cannot edit legacy catalog plans." });
    }
    if (plan.owner_id !== req.userId) {
      return res.status(403).json({ error: "You can only edit plans you own." });
    }
  }

  // Validate editable fields (id, owner_id, and created_at are immutable)
  const newName = req.body.name !== undefined ? String(req.body.name).trim() : plan.name;
  if (!newName) {
    return res.status(400).json({ error: "Plan name cannot be empty." });
  }

  const newSoloPrice = req.body.solo_price !== undefined
    ? Math.round(Number(req.body.solo_price) * 100)
    : plan.solo_price;
  if (isNaN(newSoloPrice) || newSoloPrice <= 0) {
    return res.status(400).json({ error: "Valid solo price is required." });
  }

  const newPricePerSeat = req.body.price_per_seat !== undefined
    ? Math.round(Number(req.body.price_per_seat) * 100)
    : plan.price_per_seat;
  if (isNaN(newPricePerSeat) || newPricePerSeat <= 0) {
    return res.status(400).json({ error: "Valid price per seat is required." });
  }

  const newFamilyPrice = req.body.family_price !== undefined
    ? Math.round(Number(req.body.family_price) * 100)
    : plan.family_price;
  if (isNaN(newFamilyPrice) || newFamilyPrice <= 0) {
    return res.status(400).json({ error: "Valid family plan cost is required." });
  }

  const newDefaultSeats = req.body.default_seats !== undefined
    ? Math.round(Number(req.body.default_seats))
    : plan.default_seats;
  if (isNaN(newDefaultSeats) || newDefaultSeats < 1) {
    return res.status(400).json({ error: "Default seats must be at least 1." });
  }

  const newLogo = req.body.logo !== undefined
    ? (req.body.logo ? String(req.body.logo).trim() : null)
    : plan.logo;
  const newColor = req.body.color !== undefined
    ? (req.body.color ? String(req.body.color).trim() : null)
    : plan.color;

  const priceChanged = newPricePerSeat !== plan.price_per_seat;

  try {
    db.exec("BEGIN");

    db.prepare(`
      UPDATE plans
      SET name = ?, solo_price = ?, price_per_seat = ?, family_price = ?, default_seats = ?, logo = ?, color = ?
      WHERE id = ?
    `).run(newName, newSoloPrice, newPricePerSeat, newFamilyPrice, newDefaultSeats, newLogo, newColor, plan.id);

    if (priceChanged) {
      // Propagate new price_per_seat to ALL existing groups for this plan
      db.prepare(`
        UPDATE groups
        SET price_per_seat = ?
        WHERE plan_id = ?
      `).run(newPricePerSeat, plan.id);

      // Notify affected users — deduplicated using DISTINCT so a user in multiple groups gets only one notification
      const affectedUsers = db.prepare(`
        SELECT DISTINCT gm.user_id
        FROM group_members gm
        JOIN groups g ON g.id = gm.group_id
        WHERE g.plan_id = ?
      `).all(plan.id);

      const notificationText = `The seat price for ${newName} has changed to ₦${(newPricePerSeat / 100).toLocaleString()}/month. This affects your group subscription.`;
      const insertNotification = db.prepare(`
        INSERT INTO notifications (user_id, text, type, link)
        VALUES (?, ?, 'plan', '/dashboard')
      `);

      for (const u of affectedUsers) {
        insertNotification.run(u.user_id, notificationText);
      }
    }

    const oldSeat = plan.price_per_seat != null ? `₦${plan.price_per_seat / 100}` : "not set";
    const newSeat = `₦${newPricePerSeat / 100}`;
    logAudit(
      req.userId,
      "plan.edit",
      "plan",
      plan.id,
      `Updated "${newName}" (price per seat: ${oldSeat} -> ${newSeat})`
    );

    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch (_) {}
    console.error("Failed to update plan:", err);
    return res.status(500).json({ error: "Failed to update plan." });
  }

  res.json({
    message: `${newName} updated successfully.`,
    plan: {
      id: plan.id,
      name: newName,
      logo: newLogo,
      color: newColor,
      solo_price: newSoloPrice / 100,
      price_per_seat: newPricePerSeat / 100,
      family_price: newFamilyPrice / 100,
      default_seats: newDefaultSeats,
      owner_id: plan.owner_id ?? null,
    },
  });
});

// DELETE /api/plans/:id — delete a plan catalog entry (admin/owner only)
router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  const plan = db.prepare("SELECT id, name, owner_id FROM plans WHERE id = ?").get(req.params.id);
  if (!plan) return res.status(404).json({ error: "Plan not found." });

  // Authorization rules:
  // - admin may delete any plan
  // - owner may only delete plans where plan.owner_id === req.userId
  // - owner cannot delete legacy NULL-owner plan
  if (req.userRole !== "admin") {
    if (plan.owner_id == null) {
      return res.status(403).json({ error: "You cannot delete legacy catalog plans." });
    }
    if (plan.owner_id !== req.userId) {
      return res.status(403).json({ error: "You can only delete plans you own." });
    }
  }

  const groupIds = db.prepare("SELECT id FROM groups WHERE plan_id = ?").all(req.params.id).map(g => g.id);

  if (groupIds.length > 0 && req.query.force !== "true") {
    return res.status(400).json({
      error: `${plan.name} has ${groupIds.length} group(s) using it. Deleting will remove those groups and kick out all their members — no refunds happen automatically.`,
      groupCount: groupIds.length,
    });
  }

  try {
    db.exec("BEGIN");

    if (groupIds.length > 0) {
      const placeholders = groupIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM group_members WHERE group_id IN (${placeholders})`).run(...groupIds);
      db.prepare(`DELETE FROM groups WHERE id IN (${placeholders})`).run(...groupIds);
    }

    db.prepare("DELETE FROM plans WHERE id = ?").run(req.params.id);

    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch (_) {}
    console.error("Failed to delete plan:", err);
    return res.status(500).json({ error: "Failed to delete plan." });
  }

  logAudit(req.userId, "plan.delete", "plan", plan.id, `Deleted "${plan.name}" and ${groupIds.length} linked group(s)`);

  res.json({ message: `${plan.name} and ${groupIds.length} linked group(s) deleted.` });
});

module.exports = router;