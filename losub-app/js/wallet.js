document.addEventListener("DOMContentLoaded", () => {

  seedWalletIfEmpty(5000);
  seedTransactionsIfEmpty([
    { id: "tx1", type: "fund", description: "Wallet funded", amount: 5000, status: "success", date: new Date(Date.now() - 86400000 * 6).toISOString() },
    { id: "tx2", type: "plan_payment", description: "Netflix seat payment", amount: -1500, status: "success", date: new Date(Date.now() - 86400000 * 3).toISOString() },
    { id: "tx3", type: "airtime", description: "MTN airtime top-up", amount: -500, status: "success", date: new Date(Date.now() - 86400000).toISOString() },
  ]);

  const fmt = n => `₦${Math.abs(n).toLocaleString()}`;
  const typeIcon = { fund: "💰", plan_payment: "📦", airtime: "📱", data: "📶" };

  let visibleCount = 5;
  let currentRange = "all";
  let customFrom = null;
  let customTo = null;

  function getFilteredTransactions() {
    const all = getTransactions();
    if (currentRange === "all" && !customFrom && !customTo) return all;

    const now = new Date();
    let start = null;

    if (currentRange === "today") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (currentRange === "week") {
      start = new Date(now);
      start.setDate(now.getDate() - 7);
    } else if (currentRange === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return all.filter(tx => {
      const txDate = new Date(tx.date);
      if (customFrom && txDate < new Date(customFrom)) return false;
      if (customTo && txDate > new Date(customTo + "T23:59:59")) return false;
      if (start && !customFrom && !customTo && txDate < start) return false;
      return true;
    });
  }

  function renderBalance() {
    document.getElementById("walletBalance").textContent = fmt(getWalletBalance());
  }

  function renderTransactions() {
    const filtered = getFilteredTransactions();
    const list = document.getElementById("txList");
    const empty = document.getElementById("txEmpty");
    const viewMoreBtn = document.getElementById("viewMoreBtn");

    if (!filtered.length) {
      list.hidden = true;
      empty.hidden = false;
      viewMoreBtn.hidden = true;
      return;
    }
    list.hidden = false;
    empty.hidden = true;

    const visible = filtered.slice(0, visibleCount);

    list.innerHTML = visible.map(tx => {
      const isIn = tx.amount > 0;
      const dateStr = new Date(tx.date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
      return `
        <li class="tx-item">
          <span class="tx-item__icon ${isIn ? 'tx-item__icon--in' : 'tx-item__icon--out'}">${typeIcon[tx.type] || "💳"}</span>
          <div class="tx-item__body">
            <div class="tx-item__desc">${tx.description}</div>
            <div class="tx-item__date">${dateStr}</div>
          </div>
          <span class="tx-item__amount ${isIn ? 'tx-item__amount--in' : 'tx-item__amount--out'}">${isIn ? '+' : '-'}${fmt(tx.amount)}</span>
        </li>
      `;
    }).join("");

    viewMoreBtn.hidden = filtered.length <= visibleCount;
  }

  document.getElementById("viewMoreBtn").addEventListener("click", () => {
    visibleCount += 5;
    renderTransactions();
  });

  document.getElementById("dateFilterTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-bar__btn");
    if (!btn) return;
    document.querySelectorAll("#dateFilterTabs .tab-bar__btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    currentRange = btn.dataset.range;
    customFrom = null;
    customTo = null;
    document.getElementById("dateFrom").value = "";
    document.getElementById("dateTo").value = "";
    visibleCount = 5;
    renderTransactions();
  });

  document.getElementById("applyCustomRange").addEventListener("click", () => {
    customFrom = document.getElementById("dateFrom").value || null;
    customTo = document.getElementById("dateTo").value || null;
    if (customFrom || customTo) {
      document.querySelectorAll("#dateFilterTabs .tab-bar__btn").forEach(b => b.classList.remove("is-active"));
    }
    visibleCount = 5;
    renderTransactions();
  });

  // ---------- Fund wallet modal ----------
  let selectedFundAmount = null;

  document.getElementById("openFundModal").addEventListener("click", () => {
    document.getElementById("fundModalOverlay").hidden = false;
  });

  document.getElementById("fundModalClose").addEventListener("click", closeFundModal);
  document.getElementById("fundModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "fundModalOverlay") closeFundModal();
  });

  function closeFundModal() {
    document.getElementById("fundModalOverlay").hidden = true;
    selectedFundAmount = null;
    document.getElementById("fundAmountInput").value = "";
    document.querySelectorAll(".amount-chip").forEach(c => c.classList.remove("is-active"));
    document.getElementById("fundMessage").hidden = true;
  }

  document.querySelectorAll(".amount-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".amount-chip").forEach(c => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      selectedFundAmount = Number(chip.dataset.amount);
      document.getElementById("fundAmountInput").value = selectedFundAmount;
    });
  });

  document.getElementById("fundAmountInput").addEventListener("input", (e) => {
    selectedFundAmount = Number(e.target.value) || null;
    document.querySelectorAll(".amount-chip").forEach(c => c.classList.remove("is-active"));
  });

  document.getElementById("confirmFundBtn").addEventListener("click", () => {
    const messageBox = document.getElementById("fundMessage");
    if (!selectedFundAmount || selectedFundAmount < 100) {
      messageBox.textContent = "Enter a valid amount (minimum ₦100).";
      messageBox.className = "airtime-message airtime-message--error";
      messageBox.hidden = false;
      return;
    }

    // TODO: replace with a real payment gateway (Paystack/Flutterwave) charge,
    // and only credit the wallet inside that gateway's success callback.
    const btn = document.getElementById("confirmFundBtn");
    btn.disabled = true;
    btn.textContent = "Processing…";

    setTimeout(() => {
      setWalletBalance(getWalletBalance() + selectedFundAmount);
      addTransaction({ type: "fund", description: "Wallet funded", amount: selectedFundAmount, status: "success" });
      btn.disabled = false;
      btn.textContent = "Fund now";
      closeFundModal();
      renderBalance();
      visibleCount = 5;
      renderTransactions();
    }, 700);
  });

  // ---------- Download PDF ----------
  document.getElementById("downloadPdfBtn").addEventListener("click", () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const transactions = getFilteredTransactions();

    doc.setFontSize(16);
    doc.text("Losub — Wallet Statement", 14, 18);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 25);
    doc.text(`Balance: ${fmt(getWalletBalance())}`, 14, 31);

    let y = 42;
    doc.setFontSize(11);
    doc.text("Date", 14, y);
    doc.text("Description", 55, y);
    doc.text("Amount", 170, y);
    y += 6;
    doc.line(14, y - 3, 196, y - 3);

    transactions.forEach(tx => {
      if (y > 280) { doc.addPage(); y = 20; }
      const dateStr = new Date(tx.date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
      const amountStr = `${tx.amount > 0 ? "+" : "-"}${fmt(tx.amount)}`;
      doc.text(dateStr, 14, y);
      doc.text(tx.description, 55, y);
      doc.text(amountStr, 170, y);
      y += 8;
    });

    doc.save("losub-wallet-statement.pdf");
  });

  // ---------- Initial render ----------
  renderBalance();
  renderTransactions();
});