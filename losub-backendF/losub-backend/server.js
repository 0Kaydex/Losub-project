require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const ownerRoutes = require("./routes/owner");
const { requireAuth } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    "https://losubapp.com",
    "https://www.losubapp.com",
    "http://127.0.0.1:5500",
    "http://localhost:5500"
  ],
  methods: ["GET", "POST", "PUT"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Losub backend is running." });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerRoutes);

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
