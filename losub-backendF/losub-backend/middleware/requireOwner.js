const db = require("../db");

function requireOwner(req, res, next) {
  const user = db
    .prepare("SELECT id, role FROM users WHERE id = ?")
    .get(req.userId);

  if (!user) {
    return res.status(401).json({
      error: "User not found."
    });
  }

  if (user.role !== "owner") {
    return res.status(403).json({
      error: "Owner access required."
    });
  }

  req.userRole = user.role;

  next();
}

module.exports = { requireOwner };