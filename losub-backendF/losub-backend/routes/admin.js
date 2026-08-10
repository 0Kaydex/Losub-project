const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/requireAdmin");
const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/test", (req, res) => {
  res.json({
    message: "Admin access confirmed.",
    userId: req.userId,
    role: req.userRole
  });
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

  res.json({
    message: `${target.email} ${newValue ? "suspended" : "reinstated"}.`,
    suspended: !!newValue,
  });
});

module.exports = router;
