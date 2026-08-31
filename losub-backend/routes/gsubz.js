const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { notify } = require("../utils/notify");

const router = express.Router();

router.use(requireAuth);

const GSUBZ_BASE =
  process.env.GSUBZ_BASE_URL || "https://gsubz.com/api";

const TEST_MODE = process.env.GSUBZ_TEST_MODE === "true";

/*
 * ============================================================
 * GSUBZ DATA SERVICES
 * ============================================================
 *
 * Losub only shows:
 *
 *   MTN
 *   Airtel
 *   Glo
 *   9mobile
 *
 * But GSUBZ has multiple data services under some networks.
 *
 * We fetch all services belonging to the selected network,
 * combine their plans, and keep the serviceID attached to
 * every plan so the correct service is used during purchase.
 *
 * Current GSUBZ services:
 *
 * MTN:
 *   mtn_sme
 *   mtn_gifting
 *   mtn_awoof
 *
 * Airtel:
 *   airtel_sme
 *   airtel_gifting
 *
 * Glo:
 *   glo_sme
 *   glo_data
 *
 * 9mobile:
 *   etisalat_data
 */

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

/*
 * Service fee added on top of Gsubz's wholesale price.
 * DATA PURCHASES ONLY.
 *
 * Airtime remains at exact cost.
 *
 * TEMPORARILY DISABLED — selling at exact GSUBZ price for now.
 * See chargeKoboFor() below.
 */
const MARKUP_PERCENT = 3;

function chargeKoboFor(costNaira) {
  const costKobo = Math.round(Number(costNaira) * 100);

  // Markup disabled for now — selling at exact GSUBZ price.
  // return Math.round(
  //   costKobo * (1 + MARKUP_PERCENT / 100)
  // );

  return costKobo;
}

/*
 * Pulls a usable price out of a GSUBZ plan object.
 *
 * We don't yet have confirmed docs for GSUBZ's exact field name,
 * and different GSUBZ endpoints/services have been seen to vary
 * (price / amount / cost / sellingPrice / variation_amount are all
 * common naming choices for wholesale reseller APIs). This checks
 * the likely candidates in order and returns the first one that's
 * a genuine positive finite number, so a plan doesn't silently
 * show ₦0 just because the primary field name guess is wrong.
 */
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

/*
 * Cloudflare can reject Node's default User-Agent.
 */
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

function makeRequestId() {
  return Date.now() + Math.floor(Math.random() * 100000);
}

function isSuccess(data) {
  return (
    data?.code === 200 ||
    data?.status === "TRANSACTION_SUCCESSFUL" ||
    data?.content?.code === "000" ||
    data?.content?.status === "TRANSACTION_SUCCESSFUL"
  );
}

function failureMessage(data) {
  return (
    data?.content?.description ||
    data?.description ||
    "Purchase failed. Your wallet was not charged."
  );
}

/*
 * ============================================================
 * GET DATA PLANS
 * ============================================================
 *
 * Example:
 *
 * GET /api/gsubz/data-plans/airtel
 *
 * This will call:
 *
 *   airtel_sme
 *   airtel_gifting
 *
 * and combine the plans into one Airtel list.
 */
router.get("/data-plans/:network", async (req, res) => {
  const network = String(req.params.network || "").toLowerCase();

  const serviceIDs = DATA_SERVICE_IDS[network];

  if (!serviceIDs || !Array.isArray(serviceIDs)) {
    return res.status(400).json({
      error: "Unknown network.",
    });
  }

  try {
    /*
     * Fetch every GSUBZ service at the same time.
     */
    const results = await Promise.all(
      serviceIDs.map(async (serviceID) => {
        try {
          const gsRes = await fetch(
            `${GSUBZ_BASE}/plans/?service=${encodeURIComponent(
              serviceID
            )}`,
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

            return {
              serviceID,
              plans: [],
            };
          }

          // TEMP DEBUG — remove once GSUBZ's real price field is confirmed.
          console.log(
            `RAW GSUBZ plan sample for ${serviceID}:`,
            JSON.stringify(data?.plans?.[0], null, 2)
          );

          return {
            serviceID,
            plans: Array.isArray(data?.plans)
              ? data.plans
              : [],
          };
        } catch (err) {
          console.error(
            `GSUBZ plans request error for ${serviceID}:`,
            err
          );

          return {
            serviceID,
            plans: [],
          };
        }
      })
    );

    /*
     * Combine all services into one Losub list.
     */
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
          /*
           * GSUBZ plan/variation value.
           */
          code: String(p.value),

          /*
           * Human-readable name.
           */
          name:
            p.displayName ||
            p.name ||
            `${p.value}`,

          /*
           * Provider wholesale price.
           */
          providerPrice,

          /*
           * Losub customer price (currently == provider price,
           * markup disabled — see chargeKoboFor).
           */
          price:
            chargeKoboFor(providerPrice) / 100,

          /*
           * VERY IMPORTANT:
           * This tells the purchase endpoint which
           * GSUBZ service this plan came from.
           */
          serviceID: result.serviceID,
        });
      }
    }

    /*
     * Remove exact duplicate plans.
     *
     * We include serviceID in the key because the same
     * plan value can legitimately exist under different
     * GSUBZ services.
     */
    const uniquePlans = [];
    const seen = new Set();

    for (const plan of plans) {
      const key =
        `${plan.serviceID}:${plan.code}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      uniquePlans.push(plan);
    }

    /*
     * Sort plans approximately by data size/name.
     *
     * We don't alter the provider plan value.
     */
    uniquePlans.sort((a, b) => {
      const aMatch = String(a.name).match(
        /([\d.]+)\s*(KB|MB|GB|TB)/i
      );

      const bMatch = String(b.name).match(
        /([\d.]+)\s*(KB|MB|GB|TB)/i
      );

      if (!aMatch || !bMatch) {
        return String(a.name).localeCompare(
          String(b.name)
        );
      }

      const units = {
        KB: 1,
        MB: 1024,
        GB: 1024 * 1024,
        TB: 1024 * 1024 * 1024,
      };

      const aSize =
        Number(aMatch[1]) *
        (units[aMatch[2].toUpperCase()] || 1);

      const bSize =
        Number(bMatch[1]) *
        (units[bMatch[2].toUpperCase()] || 1);

      return aSize - bSize;
    });

    if (!uniquePlans.length) {
      return res.status(502).json({
        error:
          "Couldn't load data plans right now.",
      });
    }

    res.json({
      network,
      plans: uniquePlans,
    });
  } catch (err) {
    console.error(
      "Gsubz plans lookup error:",
      err
    );

    res.status(502).json({
      error:
        "Couldn't reach the data provider. Try again.",
    });
  }
});

/*
 * ============================================================
 * AIRTIME PURCHASE
 * ============================================================
 *
 * POST /api/gsubz/airtime
 *
 * {
 *   network: "mtn",
 *   phone: "08012345678",
 *   amount: 500
 * }
 */
router.post("/airtime", async (req, res) => {
  const {
    network,
    phone,
    amount,
  } = req.body;

  if (
    !network ||
    !phone ||
    !amount ||
    Number(amount) < 50
  ) {
    return res.status(400).json({
      error:
        "network, phone, and a valid amount are required.",
    });
  }

  await purchaseAndRespond(req, res, {
    serviceID: network,
    isData: false,
    costNaira: Number(amount),
    phone,
    description:
      `${String(network).toUpperCase()} airtime — ${phone}`,
    extraFields: {},
  });
});

/*
 * ============================================================
 * DATA PURCHASE
 * ============================================================
 *
 * The frontend sends:
 *
 * {
 *   network,
 *   phone,
 *   serviceID,
 *   variation_code
 * }
 *
 * serviceID is important because Airtel, MTN and Glo
 * can have multiple GSUBZ services.
 */
router.post("/data", async (req, res) => {
  const {
    network,
    phone,
    variation_code,
    serviceID: requestedServiceID,
  } = req.body;

  if (
    !network ||
    !phone ||
    !variation_code ||
    !requestedServiceID
  ) {
    return res.status(400).json({
      error:
        "network, phone, serviceID, and variation_code are required.",
    });
  }

  const networkKey =
    String(network).toLowerCase();

  const allowedServices =
    DATA_SERVICE_IDS[networkKey];

  if (
    !allowedServices ||
    !allowedServices.includes(
      requestedServiceID
    )
  ) {
    return res.status(400).json({
      error:
        "Invalid data service for this network.",
    });
  }

  const serviceID = requestedServiceID;

  /*
   * Never trust the price supplied by the browser.
   *
   * We fetch the selected service again and find the
   * exact plan value from GSUBZ.
   */
  let amountNaira;

  try {
    const planRes = await fetch(
      `${GSUBZ_BASE}/plans/?service=${encodeURIComponent(
        serviceID
      )}`,
      {
        headers: gsubzGetHeaders(),
      }
    );

    const planData = await planRes.json();

    if (!planRes.ok) {
      console.error(
        "GSUBZ verification failed:",
        serviceID,
        planRes.status,
        planData
      );

      return res.status(502).json({
        error:
          "Couldn't verify the data plan price. Try again.",
      });
    }

    const match =
      Array.isArray(planData?.plans)
        ? planData.plans.find(
            (p) =>
              String(p.value) ===
              String(variation_code)
          )
        : null;

    if (!match) {
      return res.status(400).json({
        error:
          "That data plan is no longer available.",
      });
    }

    amountNaira = extractProviderPrice(match);

    if (amountNaira === null) {
      return res.status(400).json({
        error:
          "Invalid provider price for this data plan.",
      });
    }
  } catch (err) {
    console.error(
      "Gsubz plan verification error:",
      err
    );

    return res.status(502).json({
      error:
        "Couldn't verify the data plan price. Try again.",
    });
  }

  await purchaseAndRespond(req, res, {
    serviceID,
    isData: true,
    costNaira: amountNaira,
    phone,
    description:
      `${networkKey.toUpperCase()} data — ${phone}`,
    extraFields: {
      plan: String(variation_code),
    },
  });
});

/*
 * ============================================================
 * SHARED PURCHASE LOGIC
 * ============================================================
 */
async function purchaseAndRespond(
  req,
  res,
  {
    serviceID,
    isData,
    costNaira,
    phone,
    description,
    extraFields,
  }
) {
  const costKobo =
    Math.round(Number(costNaira) * 100);

  const chargeKobo = isData
    ? chargeKoboFor(costNaira)
    : costKobo;

  const feeKobo =
    chargeKobo - costKobo;

  const user = db
    .prepare(
      "SELECT wallet_balance FROM users WHERE id = ?"
    )
    .get(req.userId);

  if (!user) {
    return res.status(404).json({
      error: "User account not found.",
    });
  }

  if (
    user.wallet_balance < chargeKobo
  ) {
    return res.status(400).json({
      error:
        "Insufficient wallet balance. Fund your wallet first.",
    });
  }

  const requestID = makeRequestId();

  /*
   * Gsubz redirects /pay -> /pay/.
   *
   * We call the trailing slash directly so that fetch
   * doesn't convert the POST into a GET.
   */
  const payPath =
    TEST_MODE
      ? "/testpay/"
      : "/pay/";

  try {
    const body = new URLSearchParams({
      serviceID,
      amount: String(costNaira),
      phone,
      requestID: String(requestID),
      ...extraFields,
    });

    const gsRes = await fetch(
      `${GSUBZ_BASE}${payPath}`,
      {
        method: "POST",
        headers: gsubzHeaders(),
        body,
      }
    );

    const data = await gsRes.json();

    if (!isSuccess(data)) {
      console.error(
        "Gsubz purchase failed:",
        data
      );

      return res.status(400).json({
        error: failureMessage(data),
      });
    }

    const type =
      isData ? "data" : "airtime";

    try {
      db.exec("BEGIN");

      db.prepare(
        `UPDATE users
         SET wallet_balance = wallet_balance - ?
         WHERE id = ?`
      ).run(
        chargeKobo,
        req.userId
      );

      db.prepare(
        `INSERT INTO wallet_transactions
        (
          user_id,
          type,
          description,
          amount,
          status,
          reference
        )
        VALUES (?, ?, ?, ?, 'success', ?)`
      ).run(
        req.userId,
        type,
        description,
        -costKobo,
        String(requestID)
      );

      if (feeKobo > 0) {
        db.prepare(
          `INSERT INTO wallet_transactions
          (
            user_id,
            type,
            description,
            amount,
            status,
            reference
          )
          VALUES (?, ?, 'Service fee', ?, 'success', ?)`
        ).run(
          req.userId,
          `${type}_fee`,
          -feeKobo,
          `${requestID}_fee`
        );
      }

      db.exec("COMMIT");
    } catch (txErr) {
      db.exec("ROLLBACK");

      console.error(
        `CRITICAL: Gsubz delivered but wallet debit failed. ` +
        `ref=${requestID}, userId=${req.userId}, ` +
        `chargeKobo=${chargeKobo}`,
        txErr
      );

      return res.status(500).json({
        error:
          `Your ${type} was delivered, but we couldn't ` +
          `update your wallet balance. Contact support ` +
          `with reference ${requestID}.`,
      });
    }

    notify(
      req.userId,
      `You purchased ${description}.`,
      "wallet"
    );

    const updated = db
      .prepare(
        "SELECT wallet_balance FROM users WHERE id = ?"
      )
      .get(req.userId);

    res.json({
      message: "Purchase successful.",
      balance:
        updated.wallet_balance / 100,
      reference:
        String(requestID),
    });
  } catch (err) {
    console.error(
      "Gsubz purchase error:",
      err
    );

    res.status(502).json({
      error:
        "Couldn't reach the provider. Your wallet was not charged.",
    });
  }
}

module.exports = router;