const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireOwner } = require("../middleware/requireOwner");
const { logAudit } = require("../utils/logAudit");

const router = express.Router();

router.use(requireAuth, requireOwner);

router.get("/test", (req, res) => {
  res.json({
    message: "Owner access confirmed.",
    userId: req.userId,
    role: req.userRole
  });
});

router.get("/users", (req, res) => {
  const users = db
    .prepare("SELECT id, fullname, email, role, auth_provider, email_verified, created_at FROM users ORDER BY id")
    .all();
  res.json({ users });
});

router.put("/users/:id/role", (req, res) => {
  const { role } = req.body;
  const validRoles = ["member", "admin", "owner"];

  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: "Role must be one of: member, admin, owner." });
  }

  const target = db.prepare("SELECT id, email, role FROM users WHERE id = ?").get(req.params.id);
  if (!target) {
    return res.status(404).json({ error: "User not found." });
  }

  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, req.params.id);

  logAudit(
    req.userId,
    "user.role_change",
    "user",
    target.id,
    `Changed ${target.email} from ${target.role} to ${role}`
  );

  res.json({
    message: `${target.email} is now ${role}.`,
    userId: target.id,
    oldRole: target.role,
    newRole: role
  });
});

module.exports = router;
