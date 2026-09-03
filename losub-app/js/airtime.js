document.addEventListener("DOMContentLoaded", () => {
  const API_ORIGIN = "https://api.losubapp.com";

  const token = localStorage.getItem("losub_token");

  const user = JSON.parse(
    localStorage.getItem("losub_user") || "null"
  );

  if (!user || !token) {
    window.location.href = "auth.html";
    return;
  }

  let currentType = "airtime";
  let currentNetwork = "mtn";

  let selectedAmount = null;

  /*
   * Selected data plan now looks like:
   *
   * {
   *   code: "257",
   *   name: "10GB - 30days",
   *   price: 2523.5,
   *   providerPrice: 2450,
   *   serviceID: "mtn_gifting"
   * }
   */
  let selectedDataPlan = null;

  /*
   * network -> plans[]
   */
  const dataPlansCache = {};

  const fmt = (n) =>
    `₦${Number(n || 0).toLocaleString()}`;

  const messageBox =
    document.getElementById("airtimeMessage");

  const buyBtn =
    document.getElementById("buyBtn");

  function showMessage(
    text,
    type = "error"
  ) {
    messageBox.textContent = text;

    messageBox.className =
      `airtime-message airtime-message--${type}`;

    messageBox.hidden = false;
  }

  function hideMessage() {
    messageBox.hidden = true;
  }

  /*
   * ============================================================
   * TYPE TOGGLE
   * ============================================================
   */
  document
    .querySelectorAll(
      ".airtime-type-toggle__btn"
    )
    .forEach((btn) => {
      btn.addEventListener(
        "click",
        () => {
          document
            .querySelectorAll(
              ".airtime-type-toggle__btn"
            )
            .forEach((b) =>
              b.classList.remove(
                "is-active"
              )
            );

          btn.classList.add("is-active");

          currentType =
            btn.dataset.type;

          document.getElementById(
            "airtimeSection"
          ).hidden =
            currentType !== "airtime";

          document.getElementById(
            "dataSection"
          ).hidden =
            currentType !== "data";

          document.getElementById(
            "summaryType"
          ).textContent =
            currentType === "airtime"
              ? "Airtime"
              : "Data";

          selectedAmount = null;
          selectedDataPlan = null;

          hideMessage();

          if (
            currentType === "data"
          ) {
            loadDataPlans(
              currentNetwork
            );
          }

          updateSummary();
        }
      );
    });

  /*
   * ============================================================
   * NETWORK SELECTOR
   * ============================================================
   */
  document
    .getElementById("networkGrid")
    .addEventListener(
      "click",
      (e) => {
        const chip =
          e.target.closest(
            ".network-chip"
          );

        if (!chip) return;

        document
          .querySelectorAll(
            ".network-chip"
          )
          .forEach((c) =>
            c.classList.remove(
              "is-active"
            )
          );

        chip.classList.add(
          "is-active"
        );

        currentNetwork =
          chip.dataset.network;

        document.getElementById(
          "summaryNetwork"
        ).textContent =
          chip.textContent;

        selectedDataPlan = null;

        hideMessage();

        if (
          currentType === "data"
        ) {
          loadDataPlans(
            currentNetwork
          );
        }

        updateSummary();
      }
    );

  /*
   * ============================================================
   * AIRTIME AMOUNT QUICK SELECT
   * ============================================================
   */
  document
    .querySelectorAll(".amount-chip")
    .forEach((chip) => {
      chip.addEventListener(
        "click",
        () => {
          document
            .querySelectorAll(
              ".amount-chip"
            )
            .forEach((c) =>
              c.classList.remove(
                "is-active"
              )
            );

          chip.classList.add(
            "is-active"
          );

          selectedAmount =
            Number(
              chip.dataset.amount
            );

          document.getElementById(
            "airtimeAmount"
          ).value =
            selectedAmount;

          updateSummary();
        }
      );
    });

  document
    .getElementById(
      "airtimeAmount"
    )
    .addEventListener(
      "input",
      (e) => {
        selectedAmount =
          Number(e.target.value) ||
          null;

        document
          .querySelectorAll(
            ".amount-chip"
          )
          .forEach((c) =>
            c.classList.remove(
              "is-active"
            )
          );

        updateSummary();
      }
    );

  /*
   * ============================================================
   * LOAD DATA PLANS
   * ============================================================
   *
   * Backend handles multiple GSUBZ services.
   *
   * Example:
   *
   * Airtel:
   *   airtel_sme
   *   airtel_gifting
   *
   * The frontend receives one combined list.
   */
  async function loadDataPlans(
    network
  ) {
    const list =
      document.getElementById(
        "dataPlanList"
      );

    if (
      dataPlansCache[network]
    ) {
      renderDataPlans(
        dataPlansCache[network]
      );

      return;
    }

    list.innerHTML =
      `<p class="airtime-loading">
        Loading ${network.toUpperCase()} plans…
      </p>`;

    try {
      const res =
        await fetch(
          `${API_ORIGIN}/api/gsubz/data-plans/${encodeURIComponent(
            network
          )}`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      if (
        res.status === 401
      ) {
        window.location.href =
          "auth.html";

        return;
      }

      const data =
        await res.json();

      if (!res.ok) {
        list.innerHTML =
          `<p class="airtime-loading">
            ${data.error ||
            "Couldn't load plans."}
          </p>`;

        return;
      }

      if (
        !Array.isArray(
          data.plans
        )
      ) {
        list.innerHTML =
          `<p class="airtime-loading">
            No plans available for this network right now.
          </p>`;

        return;
      }

      dataPlansCache[network] =
        data.plans;

      renderDataPlans(
        data.plans
      );
    } catch (err) {
      console.error(
        "Load data plans error:",
        err
      );

      list.innerHTML =
        `<p class="airtime-loading">
          Couldn't reach the server. Check your connection and try again.
        </p>`;
    }
  }

  /*
   * ============================================================
   * RENDER DATA PLANS
   * ============================================================
   */
  function renderDataPlans(
    plans
  ) {
    const list =
      document.getElementById(
        "dataPlanList"
      );

    if (
      !plans ||
      !plans.length
    ) {
      list.innerHTML =
        `<p class="airtime-loading">
          No plans available for this network right now.
        </p>`;

      return;
    }

    list.innerHTML =
      plans
        .map(
          (p, index) => `
            <div
              class="data-plan-item"
              data-code="${escapeHtml(
                p.code
              )}"
              data-service="${escapeHtml(
                p.serviceID
              )}"
              data-index="${index}"
            >
              <div>
                <span class="data-plan-item__name">
                  ${escapeHtml(
                    p.name
                  )}
                </span>
              </div>

              <span class="data-plan-item__price">
                ${fmt(p.price)}
              </span>
            </div>
          `
        )
        .join("");

    list
      .querySelectorAll(
        ".data-plan-item"
      )
      .forEach((item) => {
        item.addEventListener(
          "click",
          () => {
            list
              .querySelectorAll(
                ".data-plan-item"
              )
              .forEach((i) =>
                i.classList.remove(
                  "is-active"
                )
              );

            item.classList.add(
              "is-active"
            );

            const index =
              Number(
                item.dataset.index
              );

            selectedDataPlan =
              plans[index] || null;

            updateSummary();
          }
        );
      });
  }

  /*
   * Basic HTML escaping so provider data cannot inject
   * arbitrary HTML into the page.
   */
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );
  }

  /*
   * ============================================================
   * PHONE NUMBER
   * ============================================================
   */
  document
    .getElementById(
      "phoneNumber"
    )
    .addEventListener(
      "input",
      (e) => {
        document.getElementById(
          "summaryPhone"
        ).textContent =
          e.target.value || "—";
      }
    );

  /*
   * ============================================================
   * SUMMARY
   * ============================================================
   */
  function updateSummary() {
    const total =
      currentType === "airtime"
        ? selectedAmount || 0
        : selectedDataPlan?.price ||
          0;

    document.getElementById(
      "summaryTotal"
    ).textContent =
      fmt(total);
  }

  /*
   * ============================================================
   * PURCHASE
   * ============================================================
   */
  buyBtn.addEventListener(
    "click",
    async () => {
      hideMessage();

      const phone =
        document
          .getElementById(
            "phoneNumber"
          )
          .value.trim();

      if (
        !/^0\d{10}$/.test(
          phone
        )
      ) {
        showMessage(
          "Enter a valid 11-digit phone number (e.g. 08012345678)."
        );

        return;
      }

      if (
        currentType ===
          "airtime" &&
        (!selectedAmount ||
          selectedAmount < 50)
      ) {
        showMessage(
          "Enter or select an airtime amount (minimum ₦50)."
        );

        return;
      }

      if (
        currentType === "data" &&
        !selectedDataPlan
      ) {
        showMessage(
          "Choose a data plan."
        );

        return;
      }

      /*
       * Make sure the selected plan has a service.
       *
       * This prevents an old/corrupt cached plan from
       * being purchased without knowing the GSUBZ service.
       */
      if (
        currentType === "data" &&
        !selectedDataPlan.serviceID
      ) {
        showMessage(
          "This data plan is missing its provider service. Reload the plans and try again."
        );

        return;
      }

      buyBtn.disabled = true;
      buyBtn.textContent =
        "Processing…";

      const expectedDescription =
        currentType === "airtime"
          ? `${String(currentNetwork).toUpperCase()} airtime — ${phone}`
          : `${String(currentNetwork).toUpperCase()} data — ${phone}`;
      const attemptStartedAt = Date.now();

      // If GSUBZ takes a while (cold-started server, slow provider response, etc.)
      // the browser can give up on the request before a reply ever comes back —
      // the purchase still goes through on the backend, the user's wallet is
      // still charged, but the page would otherwise just say "couldn't reach the
      // server" even though it worked. Cap how long we wait, then use this to
      // decide whether to double-check instead of assuming failure.
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        25000
      );

      try {
        const endpoint =
          currentType === "airtime"
            ? "/api/gsubz/airtime"
            : "/api/gsubz/data";

        const body =
          currentType === "airtime"
            ? {
                network:
                  currentNetwork,
                phone,
                amount:
                  selectedAmount,
              }
            : {
                network:
                  currentNetwork,

                phone,

                /*
                 * GSUBZ service that owns this plan.
                 */
                serviceID:
                  selectedDataPlan.serviceID,

                /*
                 * GSUBZ plan/variation value.
                 */
                variation_code:
                  selectedDataPlan.code,
              };

        const res =
          await fetch(
            `${API_ORIGIN}${endpoint}`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                Authorization:
                  `Bearer ${token}`,
              },

              body:
                JSON.stringify(
                  body
                ),
              signal: controller.signal,
            }
          );

        if (
          res.status === 401
        ) {
          window.location.href =
            "auth.html";

          return;
        }

        const data =
          await res.json();

        if (!res.ok) {
          showMessage(
            data.error ||
              "Purchase failed. Please try again."
          );

          return;
        }

        onPurchaseConfirmed(
          data.message ||
            "Purchase successful."
        );
      } catch (err) {
        console.error(
          "Purchase error:",
          err
        );

        // We genuinely don't know yet whether this went through — check the
        // wallet's transaction history for a matching purchase logged right
        // around when we made this request before telling the user it failed.
        const confirmed =
          await confirmPurchaseFromHistory(
            expectedDescription,
            attemptStartedAt
          );

        if (confirmed) {
          onPurchaseConfirmed(
            "Purchase successful — your connection dropped before we could confirm it, but it went through."
          );
        } else {
          showMessage(
            err.name === "AbortError"
              ? "This is taking longer than usual. Check your wallet's transaction history in a moment before trying again — you may have already been charged."
              : "Couldn't reach the server. Check your connection and try again."
          );
        }
      } finally {
        clearTimeout(timeoutId);
        buyBtn.disabled = false;
        buyBtn.textContent =
          "Buy now";
      }
    }
  );

  /*
   * Polls the wallet for a purchase transaction that matches what we just
   * attempted (same type + description) and was logged after we started the
   * request — used only when the purchase's own response never made it back
   * to the browser, so we're not left guessing whether the user was charged.
   */
  async function confirmPurchaseFromHistory(
    expectedDescription,
    attemptStartedAt
  ) {
    try {
      const res = await fetch(
        `${API_ORIGIN}/api/wallet`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!res.ok) return false;

      const data = await res.json();
      const transactions =
        Array.isArray(data.transactions)
          ? data.transactions
          : [];

      return transactions.some((tx) => {
        if (tx.type !== currentType) return false;
        if (tx.description !== expectedDescription) return false;
        const txTime = new Date(
          `${tx.created_at}Z`
        ).getTime();
        // A little slack for clock differences between browser and server.
        return txTime >= attemptStartedAt - 10000;
      });
    } catch {
      return false;
    }
  }

  /*
   * Shared "it went through" UI reset — used whether we got a normal success
   * response or had to confirm it after the fact via wallet history.
   */
  function onPurchaseConfirmed(message) {
    showMessage(message, "success");

    selectedAmount = null;
    selectedDataPlan = null;

    document.getElementById(
      "airtimeAmount"
    ).value = "";

    document
      .querySelectorAll(
        ".amount-chip, .data-plan-item"
      )
      .forEach((c) =>
        c.classList.remove(
          "is-active"
        )
      );

    updateSummary();
  }

  /*
   * Load the current network's data plans if the page
   * initially starts in data mode.
   */
  if (
    currentType === "data"
  ) {
    loadDataPlans(
      currentNetwork
    );
  }

  updateSummary();
});