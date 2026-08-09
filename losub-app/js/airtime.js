document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");
  const user = JSON.parse(localStorage.getItem("losub_user") || "null");

  if (!user || !token) {
    window.location.href = "auth.html";
    return;
  }

  let currentType = "airtime";
  let currentNetwork = "mtn";
  let selectedAmount = null;
  let selectedDataPlan = null; // { variationCode, name, price }
  let dataPlansCache = {}; // network -> plans[]

  const fmt = n => `₦${n.toLocaleString()}`;
  const messageBox = document.getElementById("airtimeMessage");
  const buyBtn = document.getElementById("buyBtn");

  function showMessage(text, type = "error") {
    messageBox.textContent = text;
    messageBox.className = `airtime-message airtime-message--${type}`;
    messageBox.hidden = false;
  }

  function hideMessage() {
    messageBox.hidden = true;
  }

  // ---------- Type toggle ----------
  document.querySelectorAll(".airtime-type-toggle__btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".airtime-type-toggle__btn").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      currentType = btn.dataset.type;
      document.getElementById("airtimeSection").hidden = currentType !== "airtime";
      document.getElementById("dataSection").hidden = currentType !== "data";
      document.getElementById("summaryType").textContent = currentType === "airtime" ? "Airtime" : "Data";
      selectedAmount = null;
      selectedDataPlan = null;
      hideMessage();
      if (currentType === "data") loadDataPlans(currentNetwork);
      updateSummary();
    });
  });

  // ---------- Network selector ----------
  document.getElementById("networkGrid").addEventListener("click", (e) => {
    const chip = e.target.closest(".network-chip");
    if (!chip) return;
    document.querySelectorAll(".network-chip").forEach(c => c.classList.remove("is-active"));
    chip.classList.add("is-active");
    currentNetwork = chip.dataset.network;
    document.getElementById("summaryNetwork").textContent = chip.textContent;
    selectedDataPlan = null;
    hideMessage();
    if (currentType === "data") loadDataPlans(currentNetwork);
    updateSummary();
  });

  // ---------- Amount quick-select (airtime) ----------
  document.querySelectorAll(".amount-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".amount-chip").forEach(c => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      selectedAmount = Number(chip.dataset.amount);
      document.getElementById("airtimeAmount").value = selectedAmount;
      updateSummary();
    });
  });

  document.getElementById("airtimeAmount").addEventListener("input", (e) => {
    selectedAmount = Number(e.target.value) || null;
    document.querySelectorAll(".amount-chip").forEach(c => c.classList.remove("is-active"));
    updateSummary();
  });

  // ---------- Data plan list (live from VTPass, via our backend) ----------
  async function loadDataPlans(network) {
    const list = document.getElementById("dataPlanList");

    if (dataPlansCache[network]) {
      renderDataPlans(dataPlansCache[network]);
      return;
    }

    list.innerHTML = `<p class="airtime-loading">Loading ${network.toUpperCase()} plans…</p>`;

    try {
      const res = await fetch(`${API_ORIGIN}/api/vtpass/data-plans/${network}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      const data = await res.json();

      if (!res.ok) {
        list.innerHTML = `<p class="airtime-loading">${data.error || "Couldn't load plans."}</p>`;
        return;
      }

      dataPlansCache[network] = data.plans;
      renderDataPlans(data.plans);
    } catch (err) {
      list.innerHTML = `<p class="airtime-loading">Couldn't reach the server. Check your connection and try again.</p>`;
    }
  }

  function renderDataPlans(plans) {
    const list = document.getElementById("dataPlanList");

    if (!plans.length) {
      list.innerHTML = `<p class="airtime-loading">No plans available for this network right now.</p>`;
      return;
    }

    list.innerHTML = plans.map(p => `
      <div class="data-plan-item" data-code="${p.code}">
        <div>
          <span class="data-plan-item__name">${p.name}</span>
        </div>
        <span class="data-plan-item__price">${fmt(p.price)}</span>
      </div>
    `).join("");

    list.querySelectorAll(".data-plan-item").forEach(item => {
      item.addEventListener("click", () => {
        list.querySelectorAll(".data-plan-item").forEach(i => i.classList.remove("is-active"));
        item.classList.add("is-active");
        selectedDataPlan = plans.find(p => p.code === item.dataset.code);
        updateSummary();
      });
    });
  }

  // ---------- Phone number ----------
  document.getElementById("phoneNumber").addEventListener("input", (e) => {
    document.getElementById("summaryPhone").textContent = e.target.value || "—";
  });

  // ---------- Summary ----------
  function updateSummary() {
    const total = currentType === "airtime" ? (selectedAmount || 0) : (selectedDataPlan?.price || 0);
    document.getElementById("summaryTotal").textContent = fmt(total);
  }

  // ---------- Purchase ----------
  buyBtn.addEventListener("click", async () => {
    hideMessage();
    const phone = document.getElementById("phoneNumber").value.trim();

    if (!/^0\d{10}$/.test(phone)) {
      showMessage("Enter a valid 11-digit phone number (e.g. 08012345678).");
      return;
    }

    if (currentType === "airtime" && (!selectedAmount || selectedAmount < 50)) {
      showMessage("Enter or select an airtime amount (minimum ₦50).");
      return;
    }

    if (currentType === "data" && !selectedDataPlan) {
      showMessage("Choose a data plan.");
      return;
    }

    buyBtn.disabled = true;
    buyBtn.textContent = "Processing…";

    try {
      const endpoint = currentType === "airtime" ? "/api/vtpass/airtime" : "/api/vtpass/data";
      const body = currentType === "airtime"
  ? { network: currentNetwork, phone, amount: selectedAmount }
  : { network: currentNetwork, phone, variation_code: selectedDataPlan.code };

      const res = await fetch(`${API_ORIGIN}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 401) { window.location.href = "auth.html"; return; }
      const data = await res.json();

      if (!res.ok) {
        showMessage(data.error || "Purchase failed. Please try again.");
        return;
      }

      showMessage(data.message || "Purchase successful.", "success");

      // Reset selection after a successful purchase.
      selectedAmount = null;
      selectedDataPlan = null;
      document.getElementById("airtimeAmount").value = "";
      document.querySelectorAll(".amount-chip, .data-plan-item").forEach(c => c.classList.remove("is-active"));
      updateSummary();
    } catch (err) {
      showMessage("Couldn't reach the server. Check your connection and try again.");
    } finally {
      buyBtn.disabled = false;
      buyBtn.textContent = "Buy now";
    }
  });
});