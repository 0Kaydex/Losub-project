const express = require("express");
const { requireAdmin } = require("../middleware/requireAdmin");

const router = express.Router();

// Test admin route
router.get("/test", requireAdmin, (req, res) => {
  res.json({
    message: "Admin access confirmed.",
    userId: req.userId,
    role: req.userRole
  });
});

module.exports = router;