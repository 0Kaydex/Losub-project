require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./db");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const ownerRoutes = require("./routes/owner");
const walletRoutes = require("./routes/wallet");
const gsubzRoutes = require("./routes/gsubz");
const plansRoutes = require("./routes/plans");
const groupsRoutes = require("./routes/groups");
const notificationsRoutes = require("./routes/notifications");
const webhooksRoutes = require("./routes/webhooks");

const { requireAuth } = require("./middleware/auth");

const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const PRODUCTION_ORIGINS = [
  "https://losubapp.com",
  "https://www.losubapp.com",
   "https://losub-app-git-feature-remove-flutterwave-we-dev3.vercel.app",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
];

const LOCAL_ORIGIN_PATTERN =
  /^(http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?|null|file:\/\/.*)$/;

// ---------------------------------------------------------
// CORS
// ---------------------------------------------------------

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        PRODUCTION_ORIGINS.includes(origin) ||
        LOCAL_ORIGIN_PATTERN.test(origin)
      ) {
        return callback(null, true);
      }

      callback(null, false);
    },

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

// ---------------------------------------------------------
// Static frontend
// ---------------------------------------------------------

app.use(
  express.static(
    path.join(__dirname, "../losub-app")
  )
);

// ---------------------------------------------------------
// Paystack webhook
//
// Paystack requires the raw request body for its
// HMAC-SHA512 signature verification.
// ---------------------------------------------------------

app.use(
  "/api/webhooks/paystack",
  express.raw({
    type: "application/json",
  })
);

// ---------------------------------------------------------
// Normal JSON requests
// ---------------------------------------------------------

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

// ---------------------------------------------------------
// Webhook routes
// ---------------------------------------------------------

app.use(
  "/api/webhooks",
  webhooksRoutes
);

// ---------------------------------------------------------
// Health
// ---------------------------------------------------------

// ---------------------------------------------------------
// Frontend pages
// ---------------------------------------------------------

// Frontend pages
app.get("/home", (req, res) => {
  res.redirect("/html/index.html");
});

app.get("/airtime", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../losub-app/html/airtime.html")
  );
});
app.get("/login", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../losub-app/html/auth.html")
  );
});

app.get("/dashboard", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../losub-app/html/dashboard.html")
  );
});

app.get("/wallet", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../losub-app/html/wallet.html")
  );
});
app.get("/account", (req, res) => {
  res.redirect("/html/account.html");
});

// app.get("/api/health", (req, res) => {
//   res.json({
//     ok: true,
//     message: "Losub backend is running.",
//   });
// });

// ---------------------------------------------------------
// API routes
// ---------------------------------------------------------

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/admin",
  adminRoutes
);

app.use(
  "/api/owner",
  ownerRoutes
);

app.use(
  "/api/wallet",
  walletRoutes
);

app.use(
  "/api/gsubz",
  gsubzRoutes
);

app.use(
  "/api/plans",
  plansRoutes
);

app.use(
  "/api/groups",
  groupsRoutes
);

app.use(
  "/api/notifications",
  notificationsRoutes
);

// ---------------------------------------------------------
// Authenticated current user
// ---------------------------------------------------------

app.get(
  "/api/auth/me",
  requireAuth,
  (req, res) => {
    const user = db
      .prepare(`
        SELECT
          id,
          fullname,
          email,
          email_verified,
          created_at
        FROM users
        WHERE id = ?
      `)
      .get(req.userId);

    if (!user) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    res.json({
      user,
    });
  }
);

// ---------------------------------------------------------
// Start server
// ---------------------------------------------------------

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Losub backend running on port ${PORT}`
    );
  }
);