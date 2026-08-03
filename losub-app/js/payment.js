document.addEventListener("DOMContentLoaded", () => {

  const managerNames = {
    Spotify: "Ngozi E.", Netflix: "Tunde A.", youtube: "Ifeoma K.",
    Capcut: "David O.", "Amazon Music": "Blessing U.", "Microsoft 365": "Samuel T.",
  };

  function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const pending = getPendingJoin();
  if (!pending) {
    window.location.href = "browse.html";
    return;
  }

  const fmt = n => `₦${n.toLocaleString()}`;

  document.getElementById("payPlanIcon").innerHTML = pending.logo
    ? `<img src="${pending.logo}" alt="${pending.plan}" style="width:28px;height:28px;">`
    : "💳";
  document.getElementById("payPlanName").textContent = pending.plan;
  document.getElementById("payAmount").textContent = fmt(pending.price);

  document.getElementById("payNowBtn").addEventListener("click", () => {
    const btn = document.getElementById("payNowBtn");
    const balance = getWalletBalance();

    if (balance < pending.price) {
      const shortBy = pending.price - balance;
      if (confirm(`Your wallet balance (${fmt(balance)}) is too low for this ${fmt(pending.price)} payment. You need ${fmt(shortBy)} more. Go fund your wallet now?`)) {
        window.location.href = "wallet.html";
      }
      return;
    }

    btn.disabled = true;
    btn.textContent = "Processing…";

    setTimeout(() => {
      const result = tryDeductFromWallet(pending.price, `${pending.plan} seat payment`, "plan_payment");

      if (!result.ok) {
        btn.disabled = false;
        btn.textContent = "Pay now";
        alert("Payment failed — your balance changed. Please try again.");
        return;
      }

      addGroup({
        id: `g_${pending.planId}_${Date.now()}`,
        plan: pending.plan,
        color: pending.color,
        role: "member",
        seatsFilled: pending.seatsFilled,
        seatsTotal: pending.seatsTotal,
        paymentStatus: "paid",
        yourPrice: pending.price,
        soloPrice: pending.soloPrice,
        manager: managerNames[pending.plan] || "Assigned manager",
        nextPaymentDate: addDays(30),
      });

      clearPendingJoin();
      window.location.href = "dashboard.html";
    }, 900);
  });

  document.getElementById("payCancelBtn").addEventListener("click", () => {
    clearPendingJoin();
    window.location.href = "browse.html";
  });
});