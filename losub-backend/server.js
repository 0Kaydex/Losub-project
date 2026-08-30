require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const ownerRoutes = require("./routes/owner");
const { requireAuth } = require("./middleware/auth");
const walletRoutes = require("./routes/wallet");
const plansRoutes = require("./routes/plans");
const groupsRoutes = require("./routes/groups");
const gsubzRoutes = require("./routes/gsubz");
const notificationsRoutes = require("./routes/notifications");
const webhooksRoutes = require("./routes/webhooks");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    "https://losubapp.com",
    "https://www.losubapp.com",
    "http://127.0.0.1:5500",
    "http://localhost:5500"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Mounted BEFORE express.json(): Paystack's webhook signature is computed over the
// raw request body, so this route needs express.raw() instead of the parsed JSON
// body the rest of the app uses.
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhooksRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Losub backend is running." });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/plans", plansRoutes);
app.use("/api/groups", groupsRoutes);
app.use("/api/gsubz", gsubzRoutes);
app.use("/api/notifications", notificationsRoutes);

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = db
    .prepare("SELECT id, fullname, email, email_verified, created_at FROM users WHERE id = ?")
    .get(req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ user });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Losub backend running on port ${PORT}`);
});