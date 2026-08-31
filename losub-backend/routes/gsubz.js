const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notify } = require("../utils/notify");

const router = express.Router();
router.use(requireAuth);

const GSUBZ_BASE = process.env.GSUBZ_BASE_URL || "https://gsubz.com/api";
// Gsubz provides dedicated test endpoints for sandbox purchases before going live —
// set GSUBZ_TEST_MODE=true in your env to use them instead of real money.
const TEST_MODE = process.env.GSUBZ_TEST_MODE === "true";

// ⚠️ CONFIRM THESE — Gsubz's public docs only gave one worked example (mtn_cg for MTN
// data). These are best-guess defaults; log into your Gsubz dashboard (or call
// GET /api/category then GET /api/service?service=mtn against your account) and override
// via env vars below if your account's actual serviceIDs differ.
const DATA_SERVICE_IDS = {
  mtn: process.env.GSUBZ_MTN_DATA_SERVICE_ID || "mtn_sme",
  mtn_cg: process.env.GSUBZ_MTN_CG_SERVICE_ID || "mtn_cg",
  mtn_gifting: process.env.GSUBZ_MTN_GIFTING_SERVICE_ID || "mtn_gifting",
  mtn_awoof: process.env.GSUBZ_MTN_AWOOF_SERVICE_ID || "mtn_awoof",

  airtel: process.env.GSUBZ_AIRTEL_DATA_SERVICE_ID || "airtel_sme",
  airtel_gifting:
    process.env.GSUBZ_AIRTEL_GIFTING_SERVICE_ID || "airtel_cg",

  glo: process.env.GSUBZ_GLO_DATA_SERVICE_ID || "glo_data",
  glo_sme: process.env.GSUBZ_GLO_SME_SERVICE_ID || "glo_sme",

  "9mobile":
    process.env.GSUBZ_9MOBILE_DATA_SERVICE_ID || "etisalat_data",
};
// Service fee added on top of Gsubz's wholesale price — DATA PURCHASES ONLY. Airtime is
// charged at exact cost, no markup. Same model as the old VTPass integration.
const MARKUP_PERCENT = 3;

function chargeKoboFor(costNaira) {
  const costKobo = Math.round(costNaira * 100);
  return Math.round(costKobo * (1 + MARKUP_PERCENT / 100));
}

// Cloudflare (which fronts gsubz.com) blocks requests carrying Node's default fetch
// User-Agent as likely bot traffic (returns a 403 challenge page instead of JSON).
// Sending a normal browser-style User-Agent avoids that block. Confirmed via curl:
// same request 403s with curl's default UA, 200s with a browser UA.
const GSUBZ_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function gsubzHeaders() {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Bearer ${process.env.GSUBZ_API_KEY}`,
    "User-Agent": GSUBZ_USER_AGENT,
  };
}

function gsubzGetHeaders() {
  return { "User-Agent": GSUBZ_USER_AGENT };
}

function makeRequestId() {
  // Gsubz wants a unique integer per transaction (their PHP example uses time()+mt_rand()).
  return Date.now() + Math.floor(Math.random() * 100000);
}

// Gsubz's response shape is inconsistent between docs examples (sometimes top-level
// code/status, sometimes nested under `content`) — check every place it could show up.
function isSuccess(data) {
  return (
    data.code === 200 ||
    data.status === "TRANSACTION_SUCCESSFUL" ||
    data.content?.code === "000" ||
    data.content?.status === "TRANSACTION_SUCCESSFUL"
  );
}

function failureMessage(data) {
  return data.content?.description || data.description || "Purchase failed. Your wallet was not charged.";
}

// GET /api/gsubz/data-plans/:network — e.g. /api/gsubz/data-plans/mtn
router.get("/data-plans/:network", async (req, res) => {
  const serviceID = DATA_SERVICE_IDS[req.params.network];
  if (!serviceID) {
    return res.status(400).json({ error: "Unknown network." });
  }

  try {
    // Public lookup endpoint — no auth required per Gsubz's docs, but Cloudflare still
    // blocks requests without a browser-like User-Agent (see GSUBZ_USER_AGENT above).
    const gsRes = await fetch(`${GSUBZ_BASE}/plans/?service=${serviceID}`, { headers: gsubzGetHeaders() });
    const data = await gsRes.json();

    if (!Array.isArray(data.plans)) {
      return res.status(502).json({ error: "Couldn't load data plans right now." });
    }

    const plans = data.plans.map(p => ({
      code: p.value,
      name: p.displayName,
      price: chargeKoboFor(Number(p.price)) / 100, // marked-up price shown to the user
    }));

    res.json({ plans });
  } catch (err) {
    console.error("Gsubz plans lookup error:", err);
    res.status(502).json({ error: "Couldn't reach the data provider. Try again." });
  }
});

// POST /api/gsubz/airtime — { network: 'mtn', phone: '08012345678', amount: 500 }
router.post("/airtime", async (req, res) => {
  const { network, phone, amount } = req.body;
  if (!network || !phone || !amount || amount < 50) {
    return res.status(400).json({ error: "network, phone, and a valid amount are required." });
  }

  await purchaseAndRespond(req, res, {
    serviceID: network, // Gsubz uses the bare network name as serviceID for airtime (mtn, airtel, glo, 9mobile)
    isData: false,
    costNaira: Number(amount),
    phone,
    description: `${network.toUpperCase()} airtime — ${phone}`,
    extraFields: {},
  });
});

// POST /api/gsubz/data — { network: 'mtn', phone: '08012345678', variation_code: '<plan value from data-plans>' }
router.post("/data", async (req, res) => {
  const { network, phone, variation_code } = req.body;
  if (!network || !phone || !variation_code) {
    return res.status(400).json({ error: "network, phone, and variation_code are required." });
  }

  const serviceID = DATA_SERVICE_IDS[network];
  if (!serviceID) {
    return res.status(400).json({ error: "Unknown network." });
  }

  // Never trust a client-supplied price for data — look up the real price for this
  // plan from Gsubz ourselves, so the wallet deduction always matches reality.
  let amountNaira;
  try {
    const planRes = await fetch(`${GSUBZ_BASE}/plans/?service=${serviceID}`, { headers: gsubzGetHeaders() });
    const planData = await planRes.json();
    const match = planData.plans?.find(p => p.value === variation_code);
    if (!match) {
      return res.status(400).json({ error: "That data plan is no longer available." });
    }
    amountNaira = Number(match.price);
  } catch (err) {
    console.error("Gsubz plan lookup error:", err);
    return res.status(502).json({ error: "Couldn't verify the data plan price. Try again." });
  }

  await purchaseAndRespond(req, res, {
    serviceID,
    isData: true,
    costNaira: amountNaira,
    phone,
    description: `${network.toUpperCase()} data — ${phone}`,
    extraFields: { plan: variation_code },
  });
});

// Shared purchase logic: check wallet -> call Gsubz -> deduct + log only on confirmed success
async function purchaseAndRespond(req, res, { serviceID, isData, costNaira, phone, description, extraFields }) {
  const costKobo = Math.round(costNaira * 100);
  const chargeKobo = isData ? chargeKoboFor(costNaira) : costKobo;
  const feeKobo = chargeKobo - costKobo;

  const user = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(req.userId);
  if (user.wallet_balance < chargeKobo) {
    return res.status(400).json({ error: "Insufficient wallet balance. Fund your wallet first." });
  }

  const requestID = makeRequestId();
  // IMPORTANT: Gsubz 301-redirects /pay -> /pay/ (trailing slash). fetch() follows
  // redirects automatically but converts POST -> GET when it does, silently dropping
  // the request body — Gsubz then (correctly, from its side) rejects the request as
  // "not POST". Hitting the trailing-slash URL directly avoids the redirect entirely.
  const payPath = TEST_MODE ? "/testpay/" : "/pay/";

  try {
    const body = new URLSearchParams({
      serviceID,
      amount: String(costNaira), // Gsubz gets paid wholesale — recipient still gets the full value
      phone,
      requestID: String(requestID),
      ...extraFields,
    });

    const gsRes = await fetch(`${GSUBZ_BASE}${payPath}`, {
      method: "POST",
      headers: gsubzHeaders(),
      body,
    });
    const data = await gsRes.json();

    if (!isSuccess(data)) {
      return res.status(400).json({ error: failureMessage(data) });
    }

    const type = isData ? "data" : "airtime";

    try {
      db.exec("BEGIN");
      db.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?").run(chargeKobo, req.userId);
      db.prepare(
        "INSERT INTO wallet_transactions (user_id, type, description, amount, status, reference) VALUES (?, ?, ?, ?, 'success', ?)"
      ).run(req.userId, type, description, -costKobo, String(requestID));
      if (feeKobo > 0) {
        db.prepare(
          "INSERT INTO wallet_transactions (user_id, type, description, amount, status, reference) VALUES (?, ?, 'Service fee', ?, 'success', ?)"
        ).run(req.userId, `${type}_fee`, -feeKobo, `${requestID}_fee`);
      }
      db.exec("COMMIT");
    } catch (txErr) {
      db.exec("ROLLBACK");
      // Gsubz has already delivered the airtime/data at this point — we can't undo that.
      // Log loudly so support can manually reconcile the wallet instead of silently losing money.
      console.error(`CRITICAL: Gsubz delivered but wallet debit failed. ref=${requestID}, userId=${req.userId}, chargeKobo=${chargeKobo}`, txErr);
      return res.status(500).json({
        error: `Your ${type} was delivered, but we couldn't update your wallet balance. Contact support with reference ${requestID}.`,
      });
    }

    notify(req.userId, `You purchased ${description}.`, "wallet");

    const updated = db.prepare("SELECT wallet_balance FROM users WHERE id = ?").get(req.userId);
    res.json({ message: "Purchase successful.", balance: updated.wallet_balance / 100, reference: String(requestID) });
  } catch (err) {
    console.error("Gsubz purchase error:", err);
    res.status(502).json({ error: "Couldn't reach the provider. Your wallet was not charged." });
  }
}

module.exports = router;