const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notify } = require("../utils/notify");

const router = express.Router();
router.use(requireAuth);

// GET /api/wallet — balance (naira) + recent transactions
router.get("/", (req, res) => {
  const user = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(req.userId);
  const rows = db
    .prepare("SELECT id, type, description, amount, status, created_at FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(req.userId);

  res.json({
    balance: user.wallet_balance / 100,
    transactions: rows.map(tx => ({ ...tx, amount: tx.amount / 100 })),
  });
});

// POST /api/wallet/fund/verify — confirm a Paystack transaction, then credit the wallet.
router.post("/fund/verify", async (req, res) => {
  const { reference } = req.body;
  if (!reference) {
    return res.status(400).json({ error: "Missing transaction reference." });
  }

  const existing = db.prepare("SELECT id FROM wallet_transactions WHERE reference = ?").get(reference);
  if (existing) {
    const user = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(req.userId);
    return res.json({ message: "Already processed.", balance: user.wallet_balance / 100 });
  }

  try {
    let verifyData;
    try {
      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      });
      verifyData = await verifyRes.json();
    } catch (fetchErr) {
      console.error("Paystack verify error:", fetchErr);
      return res.status(502).json({ error: "Couldn't reach the payment provider. Try again." });
    }

    if (!verifyData.status || verifyData.data.status !== "success") {
      return res.status(400).json({ error: "Payment could not be verified." });
    }

    const amountKobo = verifyData.data.amount;
    const payerEmail = verifyData.data.customer?.email;

    const user = db.prepare("SELECT id, email, wallet_balance FROM users WHERE id = ?").get(req.userId);
    if (!user || payerEmail?.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(403).json({ error: "This payment doesn't match your account." });
    }

    try {
      db.exec("BEGIN");
      db.prepare("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?").run(amountKobo, user.id);
      db.prepare(
        "INSERT INTO wallet_transactions (user_id, type, description, amount, status, reference) VALUES (?, 'fund', 'Wallet funded', ?, 'success', ?)"
      ).run(user.id, amountKobo, reference);
      db.exec("COMMIT");
    } catch (txErr) {
      db.exec("ROLLBACK");
      console.error("Wallet credit failed, rolled back:", txErr);
      return res.status(500).json({ error: "Couldn't complete wallet funding. Please try again or contact support with your reference." });
    }

    // Notification failure must never make a successfully-credited wallet look like a failed payment.
    try {
      notify(user.id, `Your wallet was funded with ₦${(amountKobo / 100).toLocaleString()}.`, "wallet");
    } catch (notifyErr) {
      console.error("Wallet funded but notification failed:", notifyErr);
    }

    const updated = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(user.id);
    res.json({ message: "Wallet funded.", balance: updated.wallet_balance / 100 });
  } catch (err) {
    console.error("Unexpected wallet funding error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

module.exports = router;