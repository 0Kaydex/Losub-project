const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT id, text, type, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(req.userId);
  res.json({ notifications: rows });
});

router.put("/:id/read", (req, res) => {
  db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?").run(req.params.id, req.userId);
  res.json({ message: "Marked read." });
});

router.put("/read-all", (req, res) => {
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(req.userId);
  res.json({ message: "All marked read." });
});

module.exports = router;