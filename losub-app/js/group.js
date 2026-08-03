document.addEventListener("DOMContentLoaded", () => {

  // ---- Mock data — replace with a real fetch using the ?id= param ----
  const params = new URLSearchParams(window.location.search);
  const groupId = params.get("id") || "g1";

  const groupData = {
    g1: {
      plan: "Netflix", color: "#D85A30",
      seatsFilled: 3, seatsTotal: 4,
      paymentStatus: "paid", nextPaymentDate: "Aug 12, 2026",
      yourPrice: 1500, soloPrice: 5200,
      manager: "Tunde A.",
    },
    g2: {
      plan: "Spotify", color: "#1D9E75",
      seatsFilled: 5, seatsTotal: 6,
      paymentStatus: "pending", nextPaymentDate: "Aug 3, 2026",
      yourPrice: 800, soloPrice: 3200,
      manager: "Ngozi E.",
    },
  };

  const notifications = [
    { text: "Your payment was received.", time: "2h ago" },
    { text: "Manager sent a reminder about seat renewal.", time: "3d ago" },
  ];
  // ---- End mock data ----

  const g = groupData[groupId] || groupData.g1;
  const statusLabel = { paid: "Paid", pending: "Pending", defaulted: "Defaulted" };
  const fmt = n => `₦${n.toLocaleString()}`;

  document.getElementById("planDot").style.background = g.color;
  document.getElementById("planName").textContent = g.plan;
  document.getElementById("planSeats").textContent = `${g.seatsFilled}/${g.seatsTotal} seats filled`;

  const statusEl = document.getElementById("paymentStatus");
  statusEl.textContent = statusLabel[g.paymentStatus];
  statusEl.classList.add(`status-pill--${g.paymentStatus}`);

  document.getElementById("nextPaymentDate").textContent = g.nextPaymentDate;
  document.getElementById("yourPrice").textContent = fmt(g.yourPrice);

  document.getElementById("soloPrice").textContent = fmt(g.soloPrice);
  document.getElementById("miniYourPrice").textContent = fmt(g.yourPrice);
  document.getElementById("miniSaved").textContent = fmt(g.soloPrice - g.yourPrice);

  document.getElementById("managerName").textContent = g.manager;
  document.getElementById("managerInitial").textContent = g.manager.charAt(0);

  const notifList = document.getElementById("groupNotifList");
  const notifEmpty = document.getElementById("groupNotifEmpty");

  if (!notifications.length) {
    notifList.hidden = true;
    notifEmpty.hidden = false;
  } else {
    notifList.innerHTML = notifications.map(n => `
      <li class="notif-item">
        <span class="notif-item__dot"></span>
        <div>
          <p>${n.text}</p>
          <span class="notif-item__time">${n.time}</span>
        </div>
      </li>
    `).join("");
  }

  document.getElementById("leaveGroupBtn").addEventListener("click", () => {
    if (confirm(`Leave your ${g.plan} group? This frees your seat for the next person on the waitlist.`)) {
      // TODO: call backend to remove membership, then redirect
      console.log("Leave group requested (front-end only, no backend yet).");
      window.location.href = "dashboard.html";
    }
  });
});