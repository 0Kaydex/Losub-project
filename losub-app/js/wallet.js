document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");
  const user = JSON.parse(localStorage.getItem("losub_user") || "null");

  if (!user || !token) {
    window.location.href = "auth.html";
    return;
  }

  const fmt = n => `₦${Math.abs(n).toLocaleString()}`;
  const typeIcon = { fund: "💰", fund_fee: "🧾", plan_payment: "📦", airtime: "📱", data: "📶" };
  const FUNDING_FEE = 100;

  let allTransactions = [];
  let visibleCount = 5;
  let currentRange = "all";
  let customFrom = null;
  let customTo = null;
  let currentBalance = 0;

  function getFilteredTransactions() {
    if (currentRange === "all" && !customFrom && !customTo) return allTransactions;

    const now = new Date();
    let start = null;
    if (currentRange === "today") start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (currentRange === "week") { start = new Date(now); start.setDate(now.getDate() - 7); }
    else if (currentRange === "month") start = new Date(now.getFullYear(), now.getMonth(), 1);

    return allTransactions.filter(tx => {
      const txDate = new Date(tx.created_at);
      if (customFrom && txDate < new Date(customFrom)) return false;
      if (customTo && txDate > new Date(customTo + "T23:59:59")) return false;
      if (start && !customFrom && !customTo && txDate < start) return false;
      return true;
    });
  }

  function renderBalance() {
    document.getElementById("walletBalance").textContent = fmt(currentBalance);
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
      const dateStr = new Date(tx.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
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

  async function loadWallet() {
    try {
      const res = await fetch(`${API_ORIGIN}/api/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      if (!res.ok) throw new Error("Request failed");

      const data = await res.json();
      currentBalance = data.balance;
      allTransactions = data.transactions;
      renderBalance();
      renderTransactions();
    } catch (err) {
      document.getElementById("walletBalance").textContent = "Unavailable";
    }
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

  // ---------- Fund wallet modal (real Paystack) ----------
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
    updateFeePreview();
  }

  // Shows "₦100 funding fee applies — you'll receive ₦X" under the amount input, if present in the HTML.
  function updateFeePreview() {
    const el = document.getElementById("fundFeePreview");
    if (!el) return;
    if (!selectedFundAmount || selectedFundAmount <= FUNDING_FEE) {
      el.textContent = `A ₦${FUNDING_FEE} funding fee applies to every top-up.`;
      return;
    }
    const net = selectedFundAmount - FUNDING_FEE;
    el.textContent = `₦${FUNDING_FEE} funding fee applies — you'll receive ₦${net.toLocaleString()} in your wallet.`;
  }

  document.querySelectorAll(".amount-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".amount-chip").forEach(c => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      selectedFundAmount = Number(chip.dataset.amount);
      document.getElementById("fundAmountInput").value = selectedFundAmount;
      updateFeePreview();
    });
  });

  document.getElementById("fundAmountInput").addEventListener("input", (e) => {
    selectedFundAmount = Number(e.target.value) || null;
    document.querySelectorAll(".amount-chip").forEach(c => c.classList.remove("is-active"));
    updateFeePreview();
  });

  document.getElementById("confirmFundBtn").addEventListener("click", () => {
    const messageBox = document.getElementById("fundMessage");
    if (!selectedFundAmount || selectedFundAmount <= FUNDING_FEE) {
      messageBox.textContent = `Enter a valid amount above ₦${FUNDING_FEE} (a ₦${FUNDING_FEE} funding fee applies).`;
      messageBox.className = "airtime-message airtime-message--error";
      messageBox.hidden = false;
      return;
    }

    if (typeof PaystackPop === "undefined") {
      messageBox.textContent = "Payment system failed to load. Refresh and try again.";
      messageBox.className = "airtime-message airtime-message--error";
      messageBox.hidden = false;
      return;
    }

    const btn = document.getElementById("confirmFundBtn");
    btn.disabled = true;
    btn.textContent = "Opening payment…";

    const handler = PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: user.email,
      amount: selectedFundAmount * 100,
      currency: "NGN",
      ref: `losub_${user.id}_${Date.now()}`,
      callback: function (response) {
        btn.textContent = "Confirming…";
        fetch(`${API_ORIGIN}/api/wallet/fund/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reference: response.reference }),
        })
          .then(res => res.json())
          .then(data => {
            btn.disabled = false;
            btn.textContent = "Fund now";
            if (data.balance === undefined) {
              messageBox.textContent = data.error || "Couldn't confirm the payment.";
              messageBox.className = "airtime-message airtime-message--error";
              messageBox.hidden = false;
              return;
            }
            currentBalance = data.balance;
            renderBalance();
            closeFundModal();
            loadWallet();
          })
          .catch(() => {
            btn.disabled = false;
            btn.textContent = "Fund now";
            messageBox.textContent = "Payment succeeded but confirmation failed — contact support with your reference: " + response.reference;
            messageBox.className = "airtime-message airtime-message--error";
            messageBox.hidden = false;
          });
      },
      onClose: function () {
        btn.disabled = false;
        btn.textContent = "Fund now";
      },
    });

    handler.openIframe();
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
    doc.text(`Balance: ${fmt(currentBalance)}`, 14, 31);

    let y = 42;
    doc.setFontSize(11);
    doc.text("Date", 14, y);
    doc.text("Description", 55, y);
    doc.text("Amount", 170, y);
    y += 6;
    doc.line(14, y - 3, 196, y - 3);

    transactions.forEach(tx => {
      if (y > 280) { doc.addPage(); y = 20; }
      const dateStr = new Date(tx.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
      const amountStr = `${tx.amount > 0 ? "+" : "-"}${fmt(tx.amount)}`;
      doc.text(dateStr, 14, y);
      doc.text(tx.description, 55, y);
      doc.text(amountStr, 170, y);
      y += 8;
    });

    doc.save("losub-wallet-statement.pdf");
  });

  // ---------- Initial load ----------
  loadWallet();
});