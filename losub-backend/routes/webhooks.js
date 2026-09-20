const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { notify } = require("../utils/notify");

const router = express.Router();

const FUNDING_FEE_KOBO = 10000;

// ---------------------------------------------------------
// FLUTTERWAVE WEBHOOK
// ---------------------------------------------------------
//
// Dashboard webhook URL:
//
// https://api.losubapp.com/api/webhooks/flutterwave
//
// For local testing, Flutterwave cannot normally reach
// localhost directly. You can use a public tunnel such
// as ngrok if you want to test webhooks locally.
// ---------------------------------------------------------

router.post("/flutterwave", (req, res) => {
  try {
    const configuredHash =
      process.env.FLW_SECRET_HASH;

    const receivedHash =
      req.headers["verif-hash"];

    if (!configuredHash) {
      console.error(
        "FLW_SECRET_HASH is not configured."
      );

      return res.sendStatus(500);
    }

    if (!receivedHash) {
      console.error(
        "Flutterwave webhook has no verif-hash."
      );

      return res.sendStatus(401);
    }

    if (receivedHash !== configuredHash) {
      console.error(
        "Flutterwave webhook signature mismatch."
      );

      return res.sendStatus(401);
    }

    // Acknowledge Flutterwave quickly.
    res.sendStatus(200);

    const event = req.body;

    console.log(
      "Flutterwave webhook received:",
      event?.event || event?.type || "unknown"
    );

    // We only care about successful wallet payments.
    const data = event?.data;

    if (!data) return;

    const transactionId = data.id;
    const txRef = data.tx_ref;
    const status = data.status;

    if (!transactionId || !txRef) {
      return;
    }

    if (status !== "successful") {
      return;
    }

    // -------------------------------------------------------
    // Idempotency
    // -------------------------------------------------------

    const existing = db
      .prepare(`
        SELECT id
        FROM wallet_transactions
        WHERE reference = ?
      `)
      .get(txRef);

    if (existing) {
      return;
    }

    // -------------------------------------------------------
    // Get customer / user
    //
    // FIX: Look up user by meta.user_id or tx_ref first, then fall back to email.
    // In Flutterwave sandbox, customer.email is replaced with a test rave email (ravesb_...).
    // In live mode, the billing email may differ from the registered Losub email.
    // -------------------------------------------------------

    let userId = Number(data.meta?.user_id);
    if (!userId && txRef.startsWith("losub_flw_")) {
      userId = Number(txRef.split("_")[2]);
    }

    let user = null;
    if (userId) {
      user = db
        .prepare(`
          SELECT id, email
          FROM users
          WHERE id = ?
        `)
        .get(userId);
    }

    const payerEmail =
      data.customer?.email?.toLowerCase();

    if (!user && payerEmail) {
      user = db
        .prepare(`
          SELECT id, email
          FROM users
          WHERE email = ?
        `)
        .get(payerEmail);
    }

    if (!user) {
      console.error(
        `Flutterwave webhook: no matching Losub user for ${txRef}`
      );
      return;
    }

    // -------------------------------------------------------
    // Verify the transaction directly with Flutterwave
    // before giving wallet value.
    // -------------------------------------------------------

    verifyFlutterwaveWebhookTransaction({
      transactionId,
      txRef,
      user,
    }).catch(err => {
      console.error(
        "Flutterwave webhook verification error:",
        err
      );
    });
  } catch (err) {
    console.error(
      "Flutterwave webhook error:",
      err
    );

    if (!res.headersSent) {
      res.sendStatus(500);
    }
  }
});

// ---------------------------------------------------------
// Verify Flutterwave webhook transaction
// ---------------------------------------------------------

async function verifyFlutterwaveWebhookTransaction({
  transactionId,
  txRef,
  user,
}) {
  const secretKey =
    process.env.FLW_SECRET_KEY;

  if (!secretKey) {
    console.error(
      "FLW_SECRET_KEY is not configured."
    );
    return;
  }

  try {
    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(
        transactionId
      )}/verify`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const result = await response.json();

    if (
      !response.ok ||
      result.status !== "success" ||
      !result.data
    ) {
      console.error(
        "Flutterwave webhook transaction verification failed:",
        result
      );
      return;
    }

    const payment = result.data;

    if (payment.status !== "successful") {
      return;
    }

    if (payment.tx_ref !== txRef) {
      console.error(
        `Flutterwave webhook reference mismatch: ${txRef}`
      );
      return;
    }

    if (payment.currency !== "NGN") {
      console.error(
        `Flutterwave webhook currency mismatch: ${txRef}`
      );
      return;
    }

    const amountNaira = Number(payment.amount);

    if (!Number.isFinite(amountNaira)) {
      return;
    }

    const amountKobo =
      Math.round(amountNaira * 100);

    if (amountKobo <= FUNDING_FEE_KOBO) {
      console.error(
        `Flutterwave webhook amount too small: ${txRef}`
      );
      return;
    }

    // Prevent a race between webhook and frontend verification.
    const existing = db
      .prepare(`
        SELECT id
        FROM wallet_transactions
        WHERE reference = ?
      `)
      .get(txRef);

    if (existing) {
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
          'Wallet funded via Flutterwave',
          ?,
          'success',
          ?
        )
      `).run(
        user.id,
        amountKobo,
        txRef
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
        `${txRef}_fee`
      );

      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch (_) {}

      console.error(
        "Flutterwave webhook wallet credit failed:",
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
        "Flutterwave wallet notification failed:",
        err
      );
    }
  } catch (err) {
    console.error(
      "Flutterwave webhook API error:",
      err
    );
  }
}

// ---------------------------------------------------------
// PAYSTACK WEBHOOK
// ---------------------------------------------------------
// KEEPING YOUR EXISTING PAYSTACK BACKUP.
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