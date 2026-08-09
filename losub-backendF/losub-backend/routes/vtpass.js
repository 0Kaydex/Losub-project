const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const VTPASS_BASE = process.env.VTPASS_BASE_URL || "https://sandbox.vtpass.com/api";

function vtpassPayHeaders() {
  return {
    "Content-Type": "application/json",
    "api-key": process.env.VTPASS_API_KEY,
    "secret-key": process.env.VTPASS_SECRET_KEY,
  };
}

function vtpassQueryHeaders() {
  return {
    "Content-Type": "application/json",
    "api-key": process.env.VTPASS_API_KEY,
    "public-key": process.env.VTPASS_PUBLIC_KEY,
  };
}

function makeRequestId() {
  // VTPass requires a unique request_id per transaction, conventionally date-prefixed.
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  return `${stamp}${Math.floor(Math.random() * 100000)}`;
}

// GET /api/vtpass/data-plans/:network — e.g. /api/vtpass/data-plans/mtn
router.get("/data-plans/:network", async (req, res) => {
  const serviceID = `${req.params.network}-data`;
  try {
    const vtRes = await fetch(`${VTPASS_BASE}/service-variations?serviceID=${serviceID}`, {
      headers: vtpassQueryHeaders(),
    });
    const data = await vtRes.json();

    if (!data.content?.varations) {
      return res.status(502).json({ error: "Couldn't load data plans right now." });
    }

    const plans = data.content.varations.map(v => ({
      code: v.variation_code,
      name: v.name,
      price: Number(v.variation_amount),
    }));

    res.json({ plans });
  } catch (err) {
    console.error("VTPass variations error:", err);
    res.status(502).json({ error: "Couldn't reach the data provider. Try again." });
  }
});

// POST /api/vtpass/airtime — { network: 'mtn', phone: '08012345678', amount: 500 }
router.post("/airtime", async (req, res) => {
  const { network, phone, amount } = req.body;
  if (!network || !phone || !amount || amount < 50) {
    return res.status(400).json({ error: "network, phone, and a valid amount are required." });
  }

  await purchaseAndRespond(req, res, {
    serviceID: network,
    amountNaira: Number(amount),
    phone,
    description: `${network.toUpperCase()} airtime — ${phone}`,
    extraFields: {},
  });
});

// POST /api/vtpass/data — { network: 'mtn', phone: '08012345678', variation_code: 'mtn-1gb-30days' }
router.post("/data", async (req, res) => {
  const { network, phone, variation_code } = req.body;
  if (!network || !phone || !variation_code) {
    return res.status(400).json({ error: "network, phone, and variation_code are required." });
  }

  const serviceID = `${network}-data`;

  // Never trust a client-supplied price for data — look up the real price for this
  // variation_code from VTPass ourselves, so the wallet deduction always matches reality.
  let amountNaira;
  try {
    const varRes = await fetch(`${VTPASS_BASE}/service-variations?serviceID=${serviceID}`, {
      headers: vtpassQueryHeaders(),
    });
    const varData = await varRes.json();
    const match = varData.content?.varations?.find(v => v.variation_code === variation_code);
    if (!match) {
      return res.status(400).json({ error: "That data plan is no longer available." });
    }
    amountNaira = Number(match.variation_amount);
  } catch (err) {
    console.error("VTPass variation lookup error:", err);
    return res.status(502).json({ error: "Couldn't verify the data plan price. Try again." });
  }

  await purchaseAndRespond(req, res, {
    serviceID,
    amountNaira,
    phone,
    description: `${network.toUpperCase()} data — ${phone}`,
    extraFields: { variation_code, billersCode: phone },
  });
});

// Shared purchase logic: check wallet -> call VTPass -> deduct + log only on confirmed success
async function purchaseAndRespond(req, res, { serviceID, amountNaira, phone, description, extraFields }) {
  const amountKobo = Math.round(amountNaira * 100);

  const user = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(req.userId);
  if (user.wallet_balance < amountKobo) {
    return res.status(400).json({ error: "Insufficient wallet balance. Fund your wallet first." });
  }

  const request_id = makeRequestId();

  try {
    const vtRes = await fetch(`${VTPASS_BASE}/pay`, {
      method: "POST",
      headers: vtpassPayHeaders(),
      body: JSON.stringify({
        request_id,
        serviceID,
        amount: amountNaira,
        phone,
        ...extraFields,
      }),
    });
    const data = await vtRes.json();

    // VTPass: code "000" = successful/delivered. Anything else, don't touch the wallet.
    const successCode = data.code === "000" || data.content?.transactions?.status === "delivered";
    if (!successCode) {
      return res.status(400).json({
        error: data.response_description || "Purchase failed. Your wallet was not charged.",
      });
    }

    db.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?").run(amountKobo, req.userId);
    db.prepare(
      "INSERT INTO wallet_transactions (user_id, type, description, amount, status, reference) VALUES (?, ?, ?, ?, 'success', ?)"
    ).run(req.userId, serviceID.includes("data") ? "data" : "airtime", description, -amountKobo, request_id);

    const updated = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(req.userId);
    res.json({ message: "Purchase successful.", balance: updated.wallet_balance / 100, reference: request_id });
  } catch (err) {
    console.error("VTPass purchase error:", err);
    res.status(502).json({ error: "Couldn't reach the provider. Your wallet was not charged." });
  }
}

module.exports = router;