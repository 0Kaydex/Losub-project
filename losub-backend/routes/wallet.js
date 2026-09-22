const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notify } = require("../utils/notify");

const router = express.Router();

router.use(requireAuth);

// Flat fee charged every time a user funds their wallet, in kobo (₦100).
const FUNDING_FEE_KOBO = 10000;

// Flutterwave API
const FLUTTERWAVE_API = "https://api.flutterwave.com/v3";

// ---------------------------------------------------------
// GET /api/wallet
// ---------------------------------------------------------

router.get("/", (req, res) => {
  const user = db
    .prepare("SELECT wallet_balance FROM users WHERE id = ?")
    .get(req.userId);

  const rows = db
    .prepare(`
      SELECT
        id,
        type,
        description,
        amount,
        status,
        created_at
      FROM wallet_transactions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `)
    .all(req.userId);

  res.json({
    balance: user.wallet_balance / 100,
    transactions: rows.map(tx => ({
      ...tx,
      amount: tx.amount / 100,
    })),
  });
});

// ---------------------------------------------------------
// POST /api/wallet/fund/flutterwave
//
// Creates a Flutterwave hosted checkout.
// Flutterwave is the PRIMARY payment gateway.
// ---------------------------------------------------------

router.post("/fund/flutterwave", async (req, res) => {
  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount <= 100) {
    return res.status(400).json({
      error: "Enter an amount above ₦100.",
    });
  }

  const amountKobo = Math.round(amount * 100);

  const user = db
    .prepare(`
      SELECT id, fullname, email
      FROM users
      WHERE id = ?
    `)
    .get(req.userId);

  if (!user) {
    return res.status(404).json({
      error: "User account not found.",
    });
  }

  const secretKey = process.env.FLW_SECRET_KEY;

  if (!secretKey) {
    console.error("FLW_SECRET_KEY is not configured.");
    return res.status(500).json({
      error: "Flutterwave is not configured on the server.",
    });
  }

  // Unique reference for this payment.
  const txRef = `losub_flw_${user.id}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  /*
   * Flutterwave redirects the user here after checkout.
   *
   * Example:
   * http://127.0.0.1:5501/html/wallet.html
   *
   * Flutterwave will append:
   * ?status=successful
   * &tx_ref=...
   * &transaction_id=...
   */
  const redirectUrl =
    `${process.env.FRONTEND_URL}/wallet.html`;

  try {
    const response = await fetch(`${FLUTTERWAVE_API}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount,
        currency: "NGN",
        redirect_url: redirectUrl,

        customer: {
          email: user.email,
          name: user.fullname,
        },

        customizations: {
          title: "Losub Wallet",
          description: "Fund your Losub wallet",
        },

        meta: {
          user_id: user.id,
          payment_type: "wallet_funding",
          funding_fee: FUNDING_FEE_KOBO / 100,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok || data.status !== "success" || !data.data?.link) {
      console.error("Flutterwave payment creation failed:", data);

      return res.status(502).json({
        error:
          data.message ||
          "Flutterwave could not create the payment. Please try again.",
      });
    }

    return res.json({
      success: true,
      gateway: "flutterwave",
      reference: txRef,
      checkout_url: data.data.link,
    });
  } catch (err) {
    console.error("Flutterwave create payment error:", err);

    return res.status(502).json({
      error:
        "Flutterwave is currently unavailable. You can try Paystack instead.",
      fallback: "paystack",
    });
  }
});

// ---------------------------------------------------------
// POST /api/wallet/fund/verify
//
// PRIMARY verification route for Flutterwave.
//
// Expected body:
// {
//   transaction_id: 123456,
//   tx_ref: "losub_flw_..."
// }
// ---------------------------------------------------------

router.post("/fund/verify", async (req, res) => {
  const { transaction_id, tx_ref } = req.body;

  if (!transaction_id || !tx_ref) {
    return res.status(400).json({
      error: "Missing Flutterwave transaction details.",
    });
  }

  return verifyFlutterwavePayment({
    req,
    res,
    transactionId: transaction_id,
    txRef: tx_ref,
  });
});

// ---------------------------------------------------------
// PAYSTACK BACKUP
//
// This endpoint remains available so Paystack can still
// process wallet funding if Flutterwave is unavailable.
// ---------------------------------------------------------

router.post("/fund/paystack/verify", async (req, res) => {
  const { reference } = req.body;

  if (!reference) {
    return res.status(400).json({
      error: "Missing Paystack transaction reference.",
    });
  }

  const existing = db
    .prepare(`
      SELECT id, status
      FROM wallet_transactions
      WHERE reference = ?
    `)
    .get(reference);

  if (existing) {
    const user = db
      .prepare("SELECT wallet_balance FROM users WHERE id = ?")
      .get(req.userId);

    return res.json({
      message: "Already processed.",
      balance: user.wallet_balance / 100,
    });
  }

  try {
    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const verifyData = await verifyRes.json();

    if (
      !verifyData.status ||
      verifyData.data?.status !== "success"
    ) {
      return res.status(400).json({
        error: "Paystack payment could not be verified.",
      });
    }

    const amountKobo = Number(verifyData.data.amount);
    const payerEmail = verifyData.data.customer?.email;

    const user = db
      .prepare(`
        SELECT id, email, wallet_balance
        FROM users
        WHERE id = ?
      `)
      .get(req.userId);

    if (
      !user ||
      payerEmail?.toLowerCase() !== user.email.toLowerCase()
    ) {
      return res.status(403).json({
        error: "This payment doesn't match your account.",
      });
    }

    return creditWallet({
      res,
      user,
      amountKobo,
      reference,
      gateway: "paystack",
    });
  } catch (err) {
    console.error("Paystack verification error:", err);

    return res.status(502).json({
      error:
        "Couldn't reach Paystack. Please try again.",
    });
  }
});

// ---------------------------------------------------------
// Flutterwave verification
// ---------------------------------------------------------

async function verifyFlutterwavePayment({
  req,
  res,
  transactionId,
  txRef,
}) {
  const existing = db
    .prepare(`
      SELECT id, user_id
      FROM wallet_transactions
      WHERE reference = ?
    `)
    .get(txRef);

  if (existing) {
    const user = db
      .prepare("SELECT wallet_balance FROM users WHERE id = ?")
      .get(req.userId);

    if (existing.user_id !== req.userId) {
      return res.status(403).json({
        error: "This payment doesn't belong to your account.",
      });
    }

    return res.json({
      message: "Already processed.",
      balance: user.wallet_balance / 100,
    });
  }

  const secretKey = process.env.FLW_SECRET_KEY;

  if (!secretKey) {
    return res.status(500).json({
      error: "Flutterwave is not configured.",
    });
  }

  try {
    const verifyRes = await fetch(
      `${FLUTTERWAVE_API}/transactions/${encodeURIComponent(
        transactionId
      )}/verify`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const verifyData = await verifyRes.json();

    if (
      !verifyRes.ok ||
      verifyData.status !== "success" ||
      !verifyData.data
    ) {
      console.error(
        "Flutterwave verification failed:",
        verifyData
      );

      return res.status(400).json({
        error: "Flutterwave payment could not be verified.",
      });
    }

    const payment = verifyData.data;

    // ---------------------------------------------
    // SECURITY CHECK 1: successful status
    // ---------------------------------------------

    if (payment.status !== "successful") {
      return res.status(400).json({
        error: "Flutterwave payment was not successful.",
      });
    }

    // ---------------------------------------------
    // SECURITY CHECK 2: reference
    // ---------------------------------------------

    if (payment.tx_ref !== txRef) {
      console.error(
        `Flutterwave reference mismatch. Expected ${txRef}, got ${payment.tx_ref}`
      );

      return res.status(400).json({
        error: "Payment reference mismatch.",
      });
    }

    // ---------------------------------------------
    // SECURITY CHECK 3: currency
    // ---------------------------------------------

    if (payment.currency !== "NGN") {
      return res.status(400).json({
        error: "Payment currency mismatch.",
      });
    }

    // ---------------------------------------------
    // SECURITY CHECK 4: amount
    //
    // Flutterwave returns amount in naira.
    // ---------------------------------------------

    const amountNaira = Number(payment.amount);

    if (!Number.isFinite(amountNaira)) {
      return res.status(400).json({
        error: "Invalid payment amount.",
      });
    }

    const amountKobo = Math.round(amountNaira * 100);

    // ---------------------------------------------
    // Find the authenticated Losub user
    // ---------------------------------------------

    const user = db
      .prepare(`
        SELECT id, email, wallet_balance
        FROM users
        WHERE id = ?
      `)
      .get(req.userId);

    if (!user) {
      return res.status(404).json({
        error: "User account not found.",
      });
    }

    // ---------------------------------------------
    // Security check: Verify payment ownership
    //
    // FIX: Verify against user.id using payment.meta.user_id or tx_ref.
    // In Flutterwave sandbox/test mode, payment.customer.email is automatically
    // replaced with a test rave email (e.g. ravesb_...), and in live mode,
    // users may pay using a bank transfer or card linked to a different billing email.
    // Checking payerEmail !== user.email was causing valid payments to be rejected with 403.
    // ---------------------------------------------

    const metaUserId = Number(payment.meta?.user_id);
    const txRefUserId = Number(txRef.split("_")[2]);
    const expectedUserId = metaUserId || txRefUserId;

    if (expectedUserId && expectedUserId !== user.id) {
      console.error(
        `Flutterwave account mismatch. Expected user ${user.id}, payment meta indicates user ${expectedUserId}`
      );

      return res.status(403).json({
        error: "This payment doesn't match your account.",
      });
    }

    return creditWallet({
      res,
      user,
      amountKobo,
      reference: txRef,
      gateway: "flutterwave",
    });
  } catch (err) {
    console.error(
      "Flutterwave verification error:",
      err
    );

    return res.status(502).json({
      error:
        "Couldn't reach Flutterwave. Please try again.",
    });
  }
}

// ---------------------------------------------------------
// Credit wallet
// ---------------------------------------------------------

function creditWallet({
  res,
  user,
  amountKobo,
  reference,
  gateway,
}) {
  if (amountKobo <= FUNDING_FEE_KOBO) {
    console.error(
      `Funding amount too small: gateway=${gateway}, ref=${reference}, amount=${amountKobo}`
    );

    return res.status(400).json({
      error:
        `The minimum funding amount is ₦${
          FUNDING_FEE_KOBO / 100 + 1
        }.`,
    });
  }

  const netKobo = amountKobo - FUNDING_FEE_KOBO;

  try {
    db.exec("BEGIN");

    db.prepare(`
      UPDATE users
      SET wallet_balance = wallet_balance + ?
      WHERE id = ?
    `).run(netKobo, user.id);

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
        ?,
        ?,
        'success',
        ?
      )
    `).run(
      user.id,
      `Wallet funded via ${gateway === "flutterwave" ? "Flutterwave" : "Paystack"}`,
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
  } catch (txErr) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}

    console.error(
      "Wallet credit failed:",
      txErr
    );

    return res.status(500).json({
      error:
        "Couldn't complete wallet funding. Please try again.",
    });
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
  } catch (notifyErr) {
    console.error(
      "Wallet funded but notification failed:",
      notifyErr
    );
  }

  const updated = db
    .prepare(`
      SELECT wallet_balance
      FROM users
      WHERE id = ?
    `)
    .get(user.id);

  return res.json({
    message: "Wallet funded.",
    gateway,
    balance: updated.wallet_balance / 100,
  });
}

module.exports = router;