const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  const token = header.split(" ")[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = payload.userId;
    req.role = payload.role;   // <-- Add this line

    next();
  } catch (err) {
    return res.status(401).json({
      error: "Invalid or expired session. Please log in again."
    });
  }
}

module.exports = { requireAuth };