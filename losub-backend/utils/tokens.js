const crypto = require("crypto");

// Generates a random token to email to the user, plus a hash of it to store
// in the database. We never store the raw token — only its hash — so a
// database leak alone can't be used to verify emails or reset passwords.
function generateToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

module.exports = { generateToken, hashToken };
