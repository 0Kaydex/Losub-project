require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");
const authRoutes = require("./routes/auth");
const { requireAuth } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// In development this allows your local Live Server. In production, set
// FRONTEND_ORIGIN to your real deployed frontend URL (e.g. your Vercel domain)
// so only your own site can call this API from a browser.
const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://127.0.0.1:5500";
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Losub backend is running." });
});

app.use("/api/auth", authRoutes);

// Example protected route — confirms the logged-in user's identity.
// The frontend dashboard/account pages will call this once wired up.
app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = db
    .prepare("SELECT id, fullname, email, email_verified, created_at FROM users WHERE id = ?")
    .get(req.userId);

  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ user });
});

app.listen(PORT, () => {
  console.log(`Losub backend running at http://localhost:${PORT}`);
});
