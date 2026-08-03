document.addEventListener("DOMContentLoaded", () => {

  const DATA_PLANS = {
    mtn: [
      { id: "d1", name: "1GB", validity: "1 day", price: 350 },
      { id: "d2", name: "2GB", validity: "30 days", price: 1200 },
      { id: "d3", name: "5GB", validity: "30 days", price: 2500 },
      { id: "d4", name: "10GB", validity: "30 days", price: 4500 },
    ],
    glo: [
      { id: "d1", name: "1.5GB", validity: "30 days", price: 1000 },
      { id: "d2", name: "3.5GB", validity: "30 days", price: 1500 },
      { id: "d3", name: "7.5GB", validity: "30 days", price: 3000 },
    ],
    airtel: [
      { id: "d1", name: "1GB", validity: "14 days", price: 800 },
      { id: "d2", name: "3GB", validity: "30 days", price: 1500 },
      { id: "d3", name: "10GB", validity: "30 days", price: 4000 },
    ],
    "9mobile": [
      { id: "d1", name: "1GB", validity: "30 days", price: 900 },
      { id: "d2", name: "2.5GB", validity: "30 days", price: 1600 },
    ],
  };

  let currentType = "airtime";
  let currentNetwork = "mtn";
  let selectedAmount = null;
  let selectedDataPlan = null;
  const fmt = n => `₦${n.toLocaleString()}`;

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
      if (currentType === "data") renderDataPlans();
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
    if (currentType === "data") renderDataPlans();
    selectedDataPlan = null;
    updateSummary();
  });

  // ---------- Amount quick-select ----------
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

  // ---------- Data plan list ----------
  function renderDataPlans() {
    const list = document.getElementById("dataPlanList");
    const plans = DATA_PLANS[currentNetwork] || [];
    list.innerHTML = plans.map(p => `
      <div class="data-plan-item" data-id="${p.id}">
        <div>
          <span class="data-plan-item__name">${p.name}</span>
          <span class="data-plan-item__validity">${p.validity}</span>
        </div>
        <span class="data-plan-item__price">${fmt(p.price)}</span>
      </div>
    `).join("");

    list.querySelectorAll(".data-plan-item").forEach(item => {
      item.addEventListener("click", () => {
        list.querySelectorAll(".data-plan-item").forEach(i => i.classList.remove("is-active"));
        item.classList.add("is-active");
        selectedDataPlan = plans.find(p => p.id === item.dataset.id);
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

  // ---------- Buy ----------
  document.getElementById("buyBtn").addEventListener("click", () => {
    const messageBox = document.getElementById("airtimeMessage");
    const phone = document.getElementById("phoneNumber").value.trim();

    if (!phone || phone.length < 10) {
      messageBox.textContent = "Enter a valid phone number.";
      messageBox.className = "airtime-message airtime-message--error";
      messageBox.hidden = false;
      return;
    }
    if (currentType === "airtime" && !selectedAmount) {
      messageBox.textContent = "Enter or select an amount.";
      messageBox.className = "airtime-message airtime-message--error";
      messageBox.hidden = false;
      return;
    }
    if (currentType === "data" && !selectedDataPlan) {
      messageBox.textContent = "Select a data plan.";
      messageBox.className = "airtime-message airtime-message--error";
      messageBox.hidden = false;
      return;
    }

    // TODO: replace with a real airtime/data provider API call (e.g. VTpass, Reloadly)
    console.log("Airtime/data purchase requested (front-end only, no backend yet):", {
      type: currentType, network: currentNetwork, phone,
      amount: currentType === "airtime" ? selectedAmount : selectedDataPlan.price,
    });

    messageBox.textContent = "Purchase simulated — this isn't wired to a real provider yet.";
    messageBox.className = "airtime-message airtime-message--success";
    messageBox.hidden = false;
  });
});