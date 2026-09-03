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
const gsubzRoutes = require("./routes/gsubz");
const notificationsRoutes = require("./routes/notifications");
const webhooksRoutes = require("./routes/webhooks");
const messagesRoutes = require("./routes/messages");
const { runPaymentReminders } = require("./scripts/payment-reminders");
const app = express();
const PORT = process.env.PORT || 3000;

// Every response here is dynamic (wallet balances, groups, notifications, etc). Express
// enables ETag generation by default, which makes browsers send conditional GETs and can
// let a client hang on to an old cached body if a proxy/browser gets a stale 304 in a race
// with a write. There's no static content to benefit from caching here, so turn it off and
// tell every client explicitly never to cache API responses.
app.set("etag", false);
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

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
app.use("/api/vtpass", vtpassRoutes);
app.use("/api/gsubz", gsubzRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/webhooks", webhooksRoutes);

// POST /api/cron/payment-reminders — same job as /api/admin/run-payment-reminders, but
// authenticated with a shared secret instead of a user JWT, so an external
// cron/uptime-pinger service (cron-job.org, GitHub Actions, Fly scheduled machine, etc.)
// can trigger it without logging in as an owner. Set CRON_SECRET in the environment and
// point the pinger at this URL with header "x-cron-secret: <that value>", once a day.
app.post("/api/cron/payment-reminders", express.json(), async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "CRON_SECRET is not configured on the server." });
  }
  if (req.headers["x-cron-secret"] !== secret) {
    return res.status(401).json({ error: "Invalid cron secret." });
  }
  try {
    const result = await runPaymentReminders();
    res.json({ message: "Payment reminders job completed.", ...result });
  } catch (err) {
    console.error("Cron-triggered payment reminders run failed:", err);
    res.status(500).json({ error: "Job failed — check server logs." });
  }
});
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

// Fallback in-process scheduler for payment reminders: runs once shortly after boot,
// then every 12 hours, so reminders still go out even if no external cron is wired up
// to POST /api/cron/payment-reminders. NOTE: fly.toml has auto_stop_machines enabled, so
// this only fires while the machine happens to be running (i.e. while there's traffic) —
// for a guaranteed once-a-day run regardless of traffic, set up an external pinger against
// the /api/cron/payment-reminders endpoint above instead of relying on this alone.
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
setTimeout(() => {
  runPaymentReminders().catch(err => console.error("Scheduled payment reminders run failed:", err));
  setInterval(() => {
    runPaymentReminders().catch(err => console.error("Scheduled payment reminders run failed:", err));
  }, TWELVE_HOURS_MS);
}, 30 * 1000);