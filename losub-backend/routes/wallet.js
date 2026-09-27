const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notify } = require("../utils/notify");

const router = express.Router();

router.use(requireAuth);

// Flat fee charged every time a user funds their wallet, in kobo (₦100).
const FUNDING_FEE_KOBO = 10000;

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
// PAYSTACK VERIFIED WALLET TOP-UP
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

  const gatewayLabel = gateway === "paystack" ? "Paystack" : (gateway || "Payment");

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
      `Wallet funded via ${gatewayLabel}`,
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