const express = require("express");
const bcrypt = require("bcryptjs");
const { requireAuth } = require("../middleware/auth");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { generateToken, hashToken } = require("../utils/tokens");
const { sendEmail, verificationEmail, resetPasswordEmail } = require("../utils/mailer");

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://127.0.0.1:5500/html";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET;

// ---------- SIGN UP ----------
router.post("/signup", async (req, res) => {
  try {
    const { fullname, email, password } = req.body;

    if (!fullname || !email || !password) {
      return res.status(400).json({ error: "Full name, email, and password are all required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = db
      .prepare("INSERT INTO users (fullname, email, password_hash) VALUES (?, ?, ?)")
      .run(fullname, email.toLowerCase(), passwordHash);

    const userId = result.lastInsertRowid;

    // Create + send email verification link
    const { rawToken, tokenHash } = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

    db.prepare(
      "INSERT INTO email_tokens (user_id, token_hash, type, expires_at) VALUES (?, ?, 'verify', ?)"
    ).run(userId, tokenHash, expiresAt);

    // This link hits the backend directly (GET route below), which verifies
    // the token then redirects the browser to the frontend login page.
    const verifyLink = `${BACKEND_URL}/api/auth/verify-email?token=${rawToken}`;
    const { subject, html } = verificationEmail(fullname, verifyLink);

    try {
      await sendEmail({ to: email, subject, html });
    } catch (emailErr) {
      // Account is created either way — the user can request a new
      // verification email via /resend-verification rather than being
      // stuck (can't re-signup since the email is now taken).
      console.error("Signup succeeded but verification email failed to send:", emailErr.message);
      return res.status(201).json({
        message: "Account created, but we couldn't send the verification email right now. Use 'Resend verification email' to try again.",
        emailSent: false,
      });
    }

    res.status(201).json({
      message: "Account created. Check your email to verify your account before logging in.",
      emailSent: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ---------- RESEND VERIFICATION EMAIL ----------
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());

    // Same response either way — don't reveal whether the account exists.
    const genericResponse = { message: "If that account exists and isn't verified yet, a new email is on its way." };

    if (!user || user.email_verified) {
      return res.json(genericResponse);
    }

    // Invalidate any older unused verify tokens for this user first
    db.prepare("UPDATE email_tokens SET used = 1 WHERE user_id = ? AND type = 'verify' AND used = 0").run(user.id);

    const { rawToken, tokenHash } = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      "INSERT INTO email_tokens (user_id, token_hash, type, expires_at) VALUES (?, ?, 'verify', ?)"
    ).run(user.id, tokenHash, expiresAt);

    const verifyLink = `${BACKEND_URL}/api/auth/verify-email?token=${rawToken}`;
    const { subject, html } = verificationEmail(user.fullname, verifyLink);
    await sendEmail({ to: user.email, subject, html });

    res.json(genericResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ---------- VERIFY EMAIL ----------
router.get("/verify-email", (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send("Missing verification token.");

    const tokenHash = hashToken(token);
    const row = db
      .prepare("SELECT * FROM email_tokens WHERE token_hash = ? AND type = 'verify' AND used = 0")
      .get(tokenHash);

    if (!row) return res.status(400).send("This verification link is invalid or has already been used.");
    if (new Date(row.expires_at) < new Date()) return res.status(400).send("This verification link has expired. Please request a new one.");

    db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(row.user_id);
    db.prepare("UPDATE email_tokens SET used = 1 WHERE id = ?").run(row.id);

    res.redirect(`${FRONTEND_URL}/auth.html?tab=signin&verified=1`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong verifying your email.");
  }
});

// ---------- LOGIN ----------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
    if (!user) return res.status(401).json({ error: "Incorrect email or password." });

    if (user.auth_provider === "google" && !user.password_hash) {
      return res.status(400).json({ error: "This account uses Google Sign-In. Please continue with Google instead." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Incorrect email or password." });

    if (!user.email_verified) {
      return res.status(403).json({ error: "Please verify your email before logging in." });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: { id: user.id, fullname: user.fullname, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ---------- FORGOT PASSWORD ----------
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());

    // Always respond the same way whether or not the account exists,
    // so this endpoint can't be used to check which emails are registered.
    if (user) {
      const { rawToken, tokenHash } = generateToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h

      db.prepare(
        "INSERT INTO email_tokens (user_id, token_hash, type, expires_at) VALUES (?, ?, 'reset', ?)"
      ).run(user.id, tokenHash, expiresAt);

      const resetLink = `${FRONTEND_URL}/auth.html?tab=reset&token=${rawToken}`;
      const { subject, html } = resetPasswordEmail(user.fullname, resetLink);
      await sendEmail({ to: user.email, subject, html });
    }

    res.json({ message: "If an account exists for that email, a reset link has been sent." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ---------- RESET PASSWORD ----------
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token and new password are required." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const tokenHash = hashToken(token);
    const row = db
      .prepare("SELECT * FROM email_tokens WHERE token_hash = ? AND type = 'reset' AND used = 0")
      .get(tokenHash);

    if (!row) return res.status(400).json({ error: "This reset link is invalid or has already been used." });
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: "This reset link has expired. Please request a new one." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, row.user_id);
    db.prepare("UPDATE email_tokens SET used = 1 WHERE id = ?").run(row.id);

    res.json({ message: "Password updated. You can now log in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ---------- GOOGLE SIGN-IN ----------
// Frontend uses Google Identity Services to get a signed "credential" (ID token),
// then sends it here. We verify it with Google's own library — we never see
// or handle the user's Google password.
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Missing Google credential." });

    const { OAuth2Client } = require("google-auth-library");
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, email_verified: googleVerified } = payload;

    if (!googleVerified) {
      return res.status(400).json({ error: "Your Google email isn't verified. Please verify it with Google first." });
    }

    let user = db.prepare("SELECT * FROM users WHERE google_id = ? OR email = ?").get(googleId, email.toLowerCase());

    if (!user) {
      // Brand new user signing up via Google
      const result = db
        .prepare(
          "INSERT INTO users (fullname, email, google_id, auth_provider, email_verified) VALUES (?, ?, ?, 'google', 1)"
        )
        .run(name, email.toLowerCase(), googleId);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    } else if (!user.google_id) {
      // Existing email/password account signing in with Google for the first time —
      // link the accounts rather than creating a duplicate.
      db.prepare("UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?").run(googleId, user.id);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: { id: user.id, fullname: user.fullname, email: user.email },
    });
  } catch (err) {
    console.error("Google sign-in error:", err.message);
    res.status(401).json({ error: "Google sign-in failed. Please try again." });
  }
});

// ======================================
// UPDATE PROFILE
// PUT /api/auth/me
// ======================================

router.put("/me", requireAuth, (req, res) => {

    try {

        let { fullname, email } = req.body;

        fullname = fullname.trim();
        email = email.trim().toLowerCase();

        if (!fullname || !email) {
            return res.status(400).json({
                error: "Full name and email are required."
            });
        }

        const existing = db.prepare(`
            SELECT id
            FROM users
            WHERE email = ?
            AND id != ?
        `).get(email, req.userId);

        if (existing) {
            return res.status(409).json({
                error: "Email is already in use."
            });
        }

        const current = db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(req.userId);

        const emailChanged = current.email !== email;

        db.prepare(`
            UPDATE users
            SET
                fullname = ?,
                email = ?,
                email_verified = ?
            WHERE id = ?
        `).run(
            fullname,
            email,
            emailChanged ? 0 : current.email_verified,
            req.userId
        );

        const updated = db.prepare(`
            SELECT
                id,
                fullname,
                email,
                email_verified
            FROM users
            WHERE id = ?
        `).get(req.userId);

        res.json({
            message: "Profile updated successfully.",
            user: updated
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Unable to update profile."
        });

    }

});

// ======================================
// CHANGE PASSWORD
// PUT /api/auth/me/password
// ======================================

router.put("/me/password", requireAuth, async (req, res) => {

    try {

        const {
            currentPassword,
            newPassword
        } = req.body;

        if (!currentPassword || !newPassword) {

            return res.status(400).json({
                error: "Both passwords are required."
            });

        }

        if (newPassword.length < 8) {

            return res.status(400).json({
                error: "Password must be at least 8 characters."
            });

        }

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(req.userId);

        if (user.auth_provider === "google" && !user.password_hash) {

            return res.status(400).json({
                error: "Google accounts cannot change passwords."
            });

        }

        const correct = await bcrypt.compare(
            currentPassword,
            user.password_hash
        );

        if (!correct) {

            return res.status(401).json({
                error: "Current password is incorrect."
            });

        }

        const hash = await bcrypt.hash(newPassword, 10);

        db.prepare(`
            UPDATE users
            SET password_hash = ?
            WHERE id = ?
        `).run(hash, req.userId);

        res.json({
            message: "Password updated successfully."
        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Unable to update password."
        });

    }

});

module.exports = router;
