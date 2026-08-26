const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { notify } = require("../utils/notify");

const router = express.Router();

// Flat fee charged every time a user funds their wallet, in kobo (₦100).
// Kept in sync with routes/wallet.js — same constant, two files, because this
// route must not import anything that pulls in requireAuth (Paystack has no JWT).
const FUNDING_FEE_KOBO = 10000;

// POST /api/webhooks/paystack — Paystack calls this directly on every transaction event.
// This is the safety net for wallet funding: if a user pays but closes the tab before
// the frontend calls /api/wallet/fund/verify, this webhook still credits the wallet.
//
// IMPORTANT: this route is mounted in server.js with express.raw() BEFORE the global
// express.json() middleware, because Paystack's signature is computed over the raw
// request body — parsing it to JSON first would break verification.
router.post("/paystack", (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    const secret = process.env.PAYSTACK_SECRET_KEY;

    if (!secret) {
      console.error("Paystack webhook received but PAYSTACK_SECRET_KEY is not set.");
      return res.sendStatus(500);
    }
    if (!signature) {
      return res.sendStatus(401);
    }

    // req.body is a raw Buffer here (see express.raw() in server.js) — required for
    // the HMAC to match what Paystack signed.
    const expectedSignature = crypto
      .createHmac("sha512", secret)
      .update(req.body)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("Paystack webhook signature mismatch — possible spoofed request.");
      return res.sendStatus(401);
    }

    // Always acknowledge quickly — Paystack retries if it doesn't get a fast 2xx.
    res.sendStatus(200);

    const event = JSON.parse(req.body.toString("utf8"));
    if (event.event !== "charge.success") return;

    const { reference, amount: amountKobo, customer, status } = event.data || {};
    if (status !== "success" || !reference || !amountKobo) return;

    // Idempotent: if /fund/verify (or an earlier webhook delivery) already processed
    // this reference, do nothing.
    const existing = db.prepare("SELECT id FROM wallet_transactions WHERE reference = ?").get(reference);
    if (existing) return;

    const payerEmail = customer?.email;
    const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(payerEmail?.toLowerCase());
    if (!user) {
      console.error(`Paystack webhook: no matching user for payer email on ref ${reference}`);
      return;
    }

    if (amountKobo <= FUNDING_FEE_KOBO) {
      console.error(`Paystack webhook: funding amount too small to cover fee, ref=${reference}, userId=${user.id}`);
      return;
    }

    const netKobo = amountKobo - FUNDING_FEE_KOBO;

    try {
      db.exec("BEGIN");
      db.prepare("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?").run(netKobo, user.id);
      db.prepare(
        "INSERT INTO wallet_transactions (user_id, type, description, amount, status, reference) VALUES (?, 'fund', 'Wallet funded', ?, 'success', ?)"
      ).run(user.id, amountKobo, reference);
      db.prepare(
        "INSERT INTO wallet_transactions (user_id, type, description, amount, status, reference) VALUES (?, 'fund_fee', 'Wallet funding fee', ?, 'success', ?)"
      ).run(user.id, -FUNDING_FEE_KOBO, `${reference}_fee`);
      db.exec("COMMIT");
    } catch (txErr) {
      db.exec("ROLLBACK");
      console.error(`Paystack webhook: wallet credit failed for ref ${reference}:`, txErr);
      return;
    }

    try {
      notify(user.id, `Your wallet was funded with ₦${(amountKobo / 100).toLocaleString()} (₦100 funding fee applied — ₦${(netKobo / 100).toLocaleString()} credited).`, "wallet");
    } catch (notifyErr) {
      console.error("Paystack webhook: wallet funded but notification failed:", notifyErr);
    }
  } catch (err) {
    console.error("Paystack webhook error:", err);
    if (!res.headersSent) res.sendStatus(500);
  }
});

module.exports = router;
