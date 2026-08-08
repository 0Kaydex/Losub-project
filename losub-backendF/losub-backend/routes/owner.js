const express = require("express");
const { requireOwner } = require("../middleware/requireOwner");

const router = express.Router();

// Test owner route
router.get("/test", requireOwner, (req, res) => {
  res.json({
    message: "Owner access confirmed.",
    userId: req.userId,
    role: req.userRole
  });
});

module.exports = router;