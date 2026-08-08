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

module.exports = router;
