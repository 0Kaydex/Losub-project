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
   * Selected data plan:
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

  // network -> plans[]
  const dataPlansCache = {};

  const fmt = (n) =>
    `₦${Number(n || 0).toLocaleString()}`;

  const messageBox =
    document.getElementById("airtimeMessage");

  const buyBtn =
    document.getElementById("buyBtn");

  function showMessage(text, type = "error") {
    messageBox.textContent = text;

    messageBox.className =
      `airtime-message airtime-message--${type}`;

    messageBox.hidden = false;
  }

  function hideMessage() {
    messageBox.hidden = true;
  }

  // ============================================================
  // TYPE TOGGLE
  // ============================================================

  document
    .querySelectorAll(".airtime-type-toggle__btn")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".airtime-type-toggle__btn")
          .forEach((b) =>
            b.classList.remove("is-active")
          );

        btn.classList.add("is-active");

        currentType = btn.dataset.type;

        document.getElementById(
          "airtimeSection"
        ).hidden = currentType !== "airtime";

        document.getElementById(
          "dataSection"
        ).hidden = currentType !== "data";

        document.getElementById(
          "summaryType"
        ).textContent =
          currentType === "airtime"
            ? "Airtime"
            : "Data";

        selectedAmount = null;
        selectedDataPlan = null;

        hideMessage();

        if (currentType === "data") {
          loadDataPlans(currentNetwork);
        }

        updateSummary();
      });
    });

  // ============================================================
  // NETWORK SELECTOR
  // ============================================================

  document
    .getElementById("networkGrid")
    .addEventListener("click", (e) => {
      const chip = e.target.closest(".network-chip");

      if (!chip) return;

      document
        .querySelectorAll(".network-chip")
        .forEach((c) =>
          c.classList.remove("is-active")
        );

      chip.classList.add("is-active");

      currentNetwork = chip.dataset.network;

      document.getElementById(
        "summaryNetwork"
      ).textContent = chip.textContent;

      selectedDataPlan = null;

      hideMessage();

      if (currentType === "data") {
        loadDataPlans(currentNetwork);
      }

      updateSummary();
    });

  // ============================================================
  // AIRTIME AMOUNT QUICK SELECT
  // ============================================================

  document
    .querySelectorAll(".amount-chip")
    .forEach((chip) => {
      chip.addEventListener("click", () => {
        document
          .querySelectorAll(".amount-chip")
          .forEach((c) =>
            c.classList.remove("is-active")
          );

        chip.classList.add("is-active");

        selectedAmount =
          Number(chip.dataset.amount);

        document.getElementById(
          "airtimeAmount"
        ).value = selectedAmount;

        updateSummary();
      });
    });

  document
    .getElementById("airtimeAmount")
    .addEventListener("input", (e) => {
      selectedAmount =
        Number(e.target.value) || null;

      document
        .querySelectorAll(".amount-chip")
        .forEach((c) =>
          c.classList.remove("is-active")
        );

      updateSummary();
    });

  // ============================================================
  // LOAD DATA PLANS
  // ============================================================

  async function loadDataPlans(network) {
    const list =
      document.getElementById("dataPlanList");

    if (dataPlansCache[network]) {
      renderDataPlans(
        dataPlansCache[network]
      );
      return;
    }

    list.innerHTML = `
      <p class="airtime-loading">
        Loading ${network.toUpperCase()} plans…
      </p>
    `;

    try {
      const res = await fetch(
        `${API_ORIGIN}/api/gsubz/data-plans/${encodeURIComponent(
          network
        )}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.status === 401) {
        window.location.href = "auth.html";
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        list.innerHTML = `
          <p class="airtime-loading">
            ${
              data.error ||
              "Couldn't load plans."
            }
          </p>
        `;

        return;
      }

      if (!Array.isArray(data.plans)) {
        list.innerHTML = `
          <p class="airtime-loading">
            No plans available for this network right now.
          </p>
        `;

        return;
      }

      dataPlansCache[network] = data.plans;

      renderDataPlans(data.plans);
    } catch (err) {
      console.error(
        "Load data plans error:",
        err
      );

      list.innerHTML = `
        <p class="airtime-loading">
          Couldn't reach the server. Check your connection and try again.
        </p>
      `;
    }
  }

  // ============================================================
  // RENDER DATA PLANS
  // ============================================================

  function renderDataPlans(plans) {
    const list =
      document.getElementById("dataPlanList");

    if (!plans || !plans.length) {
      list.innerHTML = `
        <p class="airtime-loading">
          No plans available for this network right now.
        </p>
      `;

      return;
    }

    list.innerHTML = plans
      .map(
        (p, index) => `
          <div
            class="data-plan-item"
            data-code="${escapeHtml(p.code)}"
            data-service="${escapeHtml(
              p.serviceID
            )}"
            data-index="${index}"
          >
            <div>
              <span class="data-plan-item__name">
                ${escapeHtml(p.name)}
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
      .querySelectorAll(".data-plan-item")
      .forEach((item) => {
        item.addEventListener("click", () => {
          list
            .querySelectorAll(".data-plan-item")
            .forEach((i) =>
              i.classList.remove("is-active")
            );

          item.classList.add("is-active");

          const index =
            Number(item.dataset.index);

          selectedDataPlan =
            plans[index] || null;

          updateSummary();
        });
      });
  }

  // ============================================================
  // HTML ESCAPING
  // ============================================================

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ============================================================
  // PHONE NUMBER
  // ============================================================

  document
    .getElementById("phoneNumber")
    .addEventListener("input", (e) => {
      document.getElementById(
        "summaryPhone"
      ).textContent =
        e.target.value || "—";
    });

  // ============================================================
  // SUMMARY
  // ============================================================

  function updateSummary() {
    const total =
      currentType === "airtime"
        ? selectedAmount || 0
        : selectedDataPlan?.price || 0;

    document.getElementById(
      "summaryTotal"
    ).textContent = fmt(total);
  }

  // ============================================================
  // RESET SELECTION
  // ============================================================

  function resetSelection() {
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
        c.classList.remove("is-active")
      );

    updateSummary();
  }

  // ============================================================
  // PURCHASE
  // ============================================================

  buyBtn.addEventListener("click", async () => {
    hideMessage();

    const phone =
      document
        .getElementById("phoneNumber")
        .value.trim();

    if (!/^0\d{10}$/.test(phone)) {
      showMessage(
        "Enter a valid 11-digit phone number (e.g. 08012345678)."
      );

      return;
    }

    if (
      currentType === "airtime" &&
      (!selectedAmount || selectedAmount < 50)
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
      showMessage("Choose a data plan.");
      return;
    }

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
    buyBtn.textContent = "Processing…";

    try {
      const endpoint =
        currentType === "airtime"
          ? "/api/gsubz/airtime"
          : "/api/gsubz/data";

      const body =
        currentType === "airtime"
          ? {
              network: currentNetwork,
              phone,
              amount: selectedAmount,
            }
          : {
              network: currentNetwork,
              phone,

              // GSUBZ service
              serviceID:
                selectedDataPlan.serviceID,

              // GSUBZ plan/variation
              variation_code:
                selectedDataPlan.code,
            };

      const res = await fetch(
        `${API_ORIGIN}${endpoint}`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },

          body: JSON.stringify(body),
        }
      );

      if (res.status === 401) {
        window.location.href = "auth.html";
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        showMessage(
          data.error ||
            "Purchase failed. Please try again."
        );

        return;
      }

      if (data.status === "pending") {
        showMessage(
          data.message ||
            "Your purchase is processing…",
          "success"
        );

        pollPurchaseStatus(
          data.reference
        );

        return;
      }

      showMessage(
        data.message ||
          "Purchase successful.",
        "success"
      );

      resetSelection();
    } catch (err) {
      console.error(
        "Purchase error:",
        err
      );

      showMessage(
        "Couldn't reach the server. Check your connection and try again."
      );
    } finally {
      buyBtn.disabled = false;
      buyBtn.textContent = "Buy now";
    }
  });

  // ============================================================
  // POLL PURCHASE STATUS
  // ============================================================

  async function pollPurchaseStatus(
    reference,
    attempt = 0
  ) {
    if (attempt >= 10) {
      showMessage(
        "Still processing — check your wallet history in a bit for the final result.",
        "success"
      );

      return;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 3000)
    );

    try {
      const res = await fetch(
        `${API_ORIGIN}/api/gsubz/status/${encodeURIComponent(
          reference
        )}`,
        {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();

      if (data.status === "success") {
        showMessage(
          "Purchase successful.",
          "success"
        );

        resetSelection();

        return;
      }

      if (data.status === "failed") {
        showMessage(
          data.error ||
            "Purchase failed. Your wallet was not charged."
        );

        return;
      }

      // Still pending
      pollPurchaseStatus(
        reference,
        attempt + 1
      );
    } catch (err) {
      console.error(
        "Polling error:",
        err
      );

      pollPurchaseStatus(
        reference,
        attempt + 1
      );
    }
  }

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  if (currentType === "data") {
    loadDataPlans(currentNetwork);
  }

  updateSummary();
});