const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { notify } = require("../utils/notify");

const router = express.Router();

const FUNDING_FEE_KOBO = 10000;

// ---------------------------------------------------------
// PAYSTACK WEBHOOK
// ---------------------------------------------------------


router.post("/paystack", (req, res) => {
  try {
    const signature =
      req.headers["x-paystack-signature"];

    const secret =
      process.env.PAYSTACK_SECRET_KEY;

    if (!secret) {
      console.error(
        "Paystack webhook received but PAYSTACK_SECRET_KEY is not set."
      );
      return res.sendStatus(500);
    }

    if (!signature) {
      return res.sendStatus(401);
    }

    const expectedSignature =
      crypto
        .createHmac("sha512", secret)
        .update(req.body)
        .digest("hex");

    if (expectedSignature !== signature) {
      console.error(
        "Paystack webhook signature mismatch."
      );
      return res.sendStatus(401);
    }

    res.sendStatus(200);

    const event =
      JSON.parse(req.body.toString("utf8"));

    if (event.event !== "charge.success") {
      return;
    }

    const {
      reference,
      amount: amountKobo,
      customer,
      status,
    } = event.data || {};

    if (
      status !== "success" ||
      !reference ||
      !amountKobo
    ) {
      return;
    }

    const existing = db
      .prepare(`
        SELECT id
        FROM wallet_transactions
        WHERE reference = ?
      `)
      .get(reference);

    if (existing) {
      return;
    }

    const payerEmail =
      customer?.email?.toLowerCase();

    const user = db
      .prepare(`
        SELECT id, email
        FROM users
        WHERE email = ?
      `)
      .get(payerEmail);

    if (!user) {
      console.error(
        `Paystack webhook: no matching user for ${reference}`
      );
      return;
    }

    if (amountKobo <= FUNDING_FEE_KOBO) {
      return;
    }

    const netKobo =
      amountKobo - FUNDING_FEE_KOBO;

    try {
      db.exec("BEGIN");

      db.prepare(`
        UPDATE users
        SET wallet_balance = wallet_balance + ?
        WHERE id = ?
      `).run(
        netKobo,
        user.id
      );

      db.prepare(`
        INSERT INTO wallet_transactions
        (
          user_id,
          type,
          description,
          amount,
          status,
          reference
        )
        VALUES
        (
          ?,
          'fund',
          'Wallet funded via Paystack',
          ?,
          'success',
          ?
        )
      `).run(
        user.id,
        amountKobo,
        reference
      );

      db.prepare(`
        INSERT INTO wallet_transactions
        (
          user_id,
          type,
          description,
          amount,
          status,
          reference
        )
        VALUES
        (
          ?,
          'fund_fee',
          'Wallet funding fee',
          ?,
          'success',
          ?
        )
      `).run(
        user.id,
        -FUNDING_FEE_KOBO,
        `${reference}_fee`
      );

      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch (_) {}

      console.error(
        "Paystack webhook wallet credit failed:",
        err
      );

      return;
    }

    try {
      notify(
        user.id,
        `Your wallet was funded with ₦${(
          amountKobo / 100
        ).toLocaleString()} (₦100 funding fee applied — ₦${(
          netKobo / 100
        ).toLocaleString()} credited).`,
        "wallet"
      );
    } catch (err) {
      console.error(
        "Paystack notification failed:",
        err
      );
    }
  } catch (err) {
    console.error(
      "Paystack webhook error:",
      err
    );

    if (!res.headersSent) {
      res.sendStatus(500);
    }
  }
});

module.exports = router;