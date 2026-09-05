const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// GET /api/notifications — the logged-in user's own notifications, newest first
router.get("/", (req, res) => {
  const notifications = db
    .prepare("SELECT id, text, type, link, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100")
    .all(req.userId);
  res.json({ notifications });
});

// PUT /api/notifications/:id/read — mark one as read (only your own)
router.put("/:id/read", (req, res) => {
  const result = db
    .prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: "Notification not found." });
  res.json({ message: "Marked as read." });
});

// PUT /api/notifications/read-all — mark every one of your unread notifications as read
router.put("/read-all", (req, res) => {
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0").run(req.userId);
  res.json({ message: "All notifications marked as read." });
});

module.exports = router;
