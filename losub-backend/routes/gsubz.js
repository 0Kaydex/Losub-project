const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notify } = require("../utils/notify");

const router = express.Router();

router.use(requireAuth);

const GSUBZ_BASE = process.env.GSUBZ_BASE_URL || "https://gsubz.com/api";
const TEST_MODE = process.env.GSUBZ_TEST_MODE === "true";
const GSUBZ_TIMEOUT_MS = Number(process.env.GSUBZ_TIMEOUT_MS || 15000);

const DATA_SERVICE_IDS = {
  mtn: [
    process.env.GSUBZ_MTN_DATA_SERVICE_ID || "mtn_sme",
    process.env.GSUBZ_MTN_GIFTING_SERVICE_ID || "mtn_gifting",
    process.env.GSUBZ_MTN_AWOOF_SERVICE_ID || "mtn_awoof",
  ],

  airtel: [
    process.env.GSUBZ_AIRTEL_DATA_SERVICE_ID || "airtel_sme",
    process.env.GSUBZ_AIRTEL_GIFTING_SERVICE_ID || "airtel_gifting",
  ],

  glo: [
    process.env.GSUBZ_GLO_DATA_SERVICE_ID || "glo_data",
    process.env.GSUBZ_GLO_SME_SERVICE_ID || "glo_sme",
  ],

  "9mobile": [
    process.env.GSUBZ_9MOBILE_DATA_SERVICE_ID || "etisalat_data",
  ],
};

const MARKUP_PERCENT = 3;

function chargeKoboFor(costNaira) {
  const costKobo = Math.round(Number(costNaira) * 100);
  return costKobo;
}

function extractProviderPrice(p) {
  const candidates = [
    p?.price,
    p?.amount,
    p?.cost,
    p?.sellingPrice,
    p?.selling_price,
    p?.variation_amount,
    p?.plan_amount,
  ];

  for (const raw of candidates) {
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      return num;
    }
  }

  return null;
}

const GSUBZ_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/126.0.0.0 Safari/537.36";

function gsubzHeaders() {
  return {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Bearer ${process.env.GSUBZ_API_KEY}`,
    "User-Agent": GSUBZ_USER_AGENT,
  };
}

function gsubzGetHeaders() {
  return {
    "User-Agent": GSUBZ_USER_AGENT,
  };
}

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function isValidNigerianPhone(phone) {
  const normalized = normalizePhone(phone);
  return /^0\d{10}$/.test(normalized);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = GSUBZ_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      console.error(`GSUBZ request timed out after ${timeoutMs}ms:`, {
        url: new URL(url).origin + new URL(url).pathname,
      });
      const timeoutErr = new Error("GSUBZ request timed out.");
      timeoutErr.code = "GSUBZ_TIMEOUT";
      throw timeoutErr;
    }

    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function makeRequestId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function isSuccess(data) {
  const topCode = String(data?.code ?? "").trim();
  const topStatus = String(data?.status ?? "").trim().toUpperCase();
  const innerCode = String(data?.content?.code ?? "").trim();
  const innerStatus = String(data?.content?.status ?? "").trim().toUpperCase();

  return (
    topCode === "200" ||
    topStatus === "TRANSACTION_SUCCESSFUL" ||
    innerCode === "000" ||
    innerCode === "200" ||
    innerStatus === "TRANSACTION_SUCCESSFUL"
  );
}

function failureMessage(data) {
  return (
    data?.content?.description ||
    data?.description ||
    "Purchase failed. Your wallet was not charged."
  );
}

function findExistingReference(reference) {
  if (!reference) {
    return null;
  }

  return db
    .prepare(`
      SELECT id, user_id, description, amount, status
      FROM wallet_transactions
      WHERE reference = ?
      LIMIT 1
    `)
    .get(String(reference));
}

router.get("/data-plans/:network", async (req, res) => {
  const network = String(req.params.network || "").toLowerCase();
  const serviceIDs = DATA_SERVICE_IDS[network];

  if (!serviceIDs || !Array.isArray(serviceIDs)) {
    return res.status(400).json({ error: "Unknown network." });
  }

  try {
    const results = await Promise.all(
      serviceIDs.map(async (serviceID) => {
        try {
          const gsRes = await fetchWithTimeout(
            `${GSUBZ_BASE}/plans/?service=${encodeURIComponent(serviceID)}`,
            {
              headers: gsubzGetHeaders(),
            }
          );

          const data = await gsRes.json();

          if (!gsRes.ok) {
            console.error(
              `GSUBZ plans request failed for ${serviceID}:`,
              gsRes.status,
              data
            );

            return { serviceID, plans: [] };
          }

          return {
            serviceID,
            plans: Array.isArray(data?.plans) ? data.plans : [],
          };
        } catch (err) {
          console.error(`GSUBZ plans request error for ${serviceID}:`, err);
          return { serviceID, plans: [] };
        }
      })
    );

    const plans = [];

    for (const result of results) {
      for (const p of result.plans) {
        if (!p || p.value === undefined) {
          continue;
        }

        const providerPrice = extractProviderPrice(p);
        if (providerPrice === null) {
          console.warn(
            `Skipping plan with no usable price field (service=${result.serviceID}):`,
            JSON.stringify(p)
          );
          continue;
        }

        plans.push({
          code: String(p.value),
          name: p.displayName || p.name || `${p.value}`,
          providerPrice,
          price: chargeKoboFor(providerPrice) / 100,
          serviceID: result.serviceID,
        });
      }
    }

    const uniquePlans = [];
    const seen = new Set();

    for (const plan of plans) {
      const key = `${plan.serviceID}:${plan.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniquePlans.push(plan);
    }

    uniquePlans.sort((a, b) => {
      const aMatch = String(a.name).match(/([\d.]+)\s*(KB|MB|GB|TB)/i);
      const bMatch = String(b.name).match(/([\d.]+)\s*(KB|MB|GB|TB)/i);

      if (!aMatch || !bMatch) {
        return String(a.name).localeCompare(String(b.name));
      }

      const units = {
        KB: 1,
        MB: 1024,
        GB: 1024 * 1024,
        TB: 1024 * 1024 * 1024,
      };

      const aSize = Number(aMatch[1]) * (units[aMatch[2].toUpperCase()] || 1);
      const bSize = Number(bMatch[1]) * (units[bMatch[2].toUpperCase()] || 1);

      return aSize - bSize;
    });

    if (!uniquePlans.length) {
      return res.status(502).json({ error: "Couldn't load data plans right now." });
    }

    return res.json({ network, plans: uniquePlans });
  } catch (err) {
    console.error("Gsubz plans lookup error:", err);
    return res.status(502).json({ error: "Couldn't reach the data provider. Try again." });
  }
});

router.post("/airtime", async (req, res) => {
  const { network, phone, amount } = req.body;
  const normalizedPhone = normalizePhone(phone);

  if (!network || !normalizedPhone || !amount || Number(amount) < 50) {
    return res.status(400).json({
      error: "network, phone, and a valid amount are required.",
    });
  }

  if (!isValidNigerianPhone(normalizedPhone)) {
    return res.status(400).json({
      error: "Enter a valid Nigerian phone number.",
    });
  }

  await purchaseAndRespond(req, res, {
    serviceID: String(network).toLowerCase(),
    isData: false,
    costNaira: Number(amount),
    phone: normalizedPhone,
    description: `${String(network).toUpperCase()} airtime — ${normalizedPhone}`,
    extraFields: {},
  });
});

router.post("/data", async (req, res) => {
  const {
    network,
    phone,
    variation_code,
    serviceID: requestedServiceID,
  } = req.body;
  const normalizedPhone = normalizePhone(phone);

  if (!network || !normalizedPhone || !variation_code || !requestedServiceID) {
    return res.status(400).json({
      error: "network, phone, serviceID, and variation_code are required.",
    });
  }

  if (!isValidNigerianPhone(normalizedPhone)) {
    return res.status(400).json({
      error: "Enter a valid Nigerian phone number.",
    });
  }

  const networkKey = String(network).toLowerCase();
  const allowedServices = DATA_SERVICE_IDS[networkKey];

  if (!allowedServices || !allowedServices.includes(requestedServiceID)) {
    return res.status(400).json({ error: "Invalid data service for this network." });
  }

  const serviceID = requestedServiceID;

  let amountNaira;

  try {
    const planRes = await fetchWithTimeout(
      `${GSUBZ_BASE}/plans/?service=${encodeURIComponent(serviceID)}`,
      {
        headers: gsubzGetHeaders(),
      }
    );

    const planData = await planRes.json();

    if (!planRes.ok) {
      console.error("GSUBZ verification failed:", serviceID, planRes.status, planData);
      return res.status(502).json({ error: "Couldn't verify the data plan price. Try again." });
    }

    const match = Array.isArray(planData?.plans)
      ? planData.plans.find((p) => String(p.value) === String(variation_code))
      : null;

    if (!match) {
      return res.status(400).json({ error: "That data plan is no longer available." });
    }

    amountNaira = extractProviderPrice(match);
    if (amountNaira === null) {
      return res.status(400).json({ error: "Invalid provider price for this data plan." });
    }
  } catch (err) {
    console.error("Gsubz plan verification error:", err);
    return res.status(502).json({ error: "Couldn't verify the data plan price. Try again." });
  }

  await purchaseAndRespond(req, res, {
    serviceID,
    isData: true,
    costNaira: amountNaira,
    phone,
    description: `${networkKey.toUpperCase()} data — ${phone}`,
    extraFields: {
      plan: String(variation_code),
    },
  });
});

async function purchaseAndRespond(
  req,
  res,
  { serviceID, isData, costNaira, phone, description, extraFields }
) {
  const costKobo = Math.round(Number(costNaira) * 100);
  const chargeKobo = isData ? chargeKoboFor(costNaira) : costKobo;
  const feeKobo = chargeKobo - costKobo;

  const user = db
    .prepare("SELECT wallet_balance FROM users WHERE id = ?")
    .get(req.userId);

  if (!user) {
    return res.status(404).json({ error: "User account not found." });
  }

  if (user.wallet_balance < chargeKobo) {
    return res.status(400).json({
      error: "Insufficient wallet balance. Fund your wallet first.",
    });
  }

  const requestID = String(
    req.body?.request_id || req.body?.requestID || makeRequestId()
  );

  const existing = findExistingReference(requestID);
  if (existing) {
    return res.status(409).json({
      error: "This purchase has already been processed.",
    });
  }

  const payPath = TEST_MODE ? "/testpay/" : "/pay/";

  try {
    const body = new URLSearchParams({
      serviceID,
      amount: String(costNaira),
      phone,
      requestID,
      ...extraFields,
    });

    const gsRes = await fetchWithTimeout(`${GSUBZ_BASE}${payPath}`, {
      method: "POST",
      headers: gsubzHeaders(),
      body,
    });

    const data = await gsRes.json();

    if (!isSuccess(data)) {
      console.error("Gsubz purchase failed:", data);
      return res.status(400).json({
        error: failureMessage(data),
      });
    }

    const type = isData ? "data" : "airtime";

    try {
      db.exec("BEGIN");

      db.prepare(
        `UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?`
      ).run(chargeKobo, req.userId);

      db.prepare(
        `INSERT INTO wallet_transactions (user_id, type, description, amount, status, reference) VALUES (?, ?, ?, ?, 'success', ?)`
      ).run(req.userId, type, description, -costKobo, requestID);

      if (feeKobo > 0) {
        db.prepare(
          `INSERT INTO wallet_transactions (user_id, type, description, amount, status, reference) VALUES (?, ?, 'Service fee', ?, 'success', ?)`
        ).run(req.userId, `${type}_fee`, -feeKobo, `${requestID}_fee`);
      }

      db.exec("COMMIT");
    } catch (txErr) {
      try {
        db.exec("ROLLBACK");
      } catch (_) {}

      console.error(
        `CRITICAL: Gsubz delivered but wallet debit failed. ref=${requestID}, userId=${req.userId}, chargeKobo=${chargeKobo}`,
        txErr
      );

      return res.status(500).json({
        error: `Your ${type} was delivered, but we couldn't update your wallet balance. Contact support with reference ${requestID}.`,
      });
    }

    notify(req.userId, `You purchased ${description}.`, "wallet");

    const updated = db
      .prepare("SELECT wallet_balance FROM users WHERE id = ?")
      .get(req.userId);

    return res.json({
      message: "Purchase successful.",
      balance: updated.wallet_balance / 100,
      reference: requestID,
    });
  } catch (err) {
    if (err?.code === "GSUBZ_TIMEOUT") {
      console.error("Gsubz purchase timeout:", {
        serviceID,
        network: String(req.body?.network || "").toLowerCase(),
        isData,
        timeoutMs: GSUBZ_TIMEOUT_MS,
      });
      return res.status(504).json({
        error: "The provider did not respond in time. Your wallet was not charged.",
      });
    }

    console.error("Gsubz purchase error:", err);
    return res.status(502).json({
      error: "Couldn't reach the provider. Your wallet was not charged.",
    });
  }
}

module.exports = router;
