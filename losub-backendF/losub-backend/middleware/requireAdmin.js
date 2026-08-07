const { requireAuth } = require("./auth");

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.role !== "admin") {
      return res.status(403).json({
        error: "Admin access required."
      });
    }

    next();
  });
}

module.exports = { requireAdmin };