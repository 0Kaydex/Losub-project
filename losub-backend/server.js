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
const vtpassRoutes = require("./routes/vtpass");
const notificationsRoutes = require("./routes/notifications");
const webhooksRoutes = require("./routes/webhooks");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

const PRODUCTION_ORIGINS = ["https://losubapp.com", "https://www.losubapp.com"];
// Local dev tools (VS Code Live Preview, Live Server, `python -m http.server`, etc.)
// don't all agree on one port — some pick a random free one every time. Rather than
// hardcode a specific port, allow any http://127.0.0.1:PORT, http://localhost:PORT, or http://[::1]:PORT.
const LOCAL_ORIGIN_PATTERN = /^(http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?|null|file:\/\/.*)$/;

app.use(cors({
  origin: (origin, callback) => {
    // Requests with no Origin header (curl, server-to-server, some webhooks) or local dev origins are allowed
    if (!origin || PRODUCTION_ORIGINS.includes(origin) || LOCAL_ORIGIN_PATTERN.test(origin)) {
      return callback(null, true);
    }
    callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Serve static frontend files directly from losub-app directory
app.use(express.static(path.join(__dirname, "../losub-app")));

// Mounted BEFORE express.json(): Paystack's webhook signature is computed over the
// raw request body, so this route needs express.raw() instead of the parsed JSON
// body the rest of the app uses.
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhooksRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.redirect("/html/index.html");
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Losub backend is running." });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/plans", plansRoutes);
app.use("/api/groups", groupsRoutes);
app.use("/api/vtpass", vtpassRoutes);
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