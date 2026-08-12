document.addEventListener("DOMContentLoaded", async () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const groupId = params.get("id");

  if (!groupId) {
    window.location.href = "dashboard.html";
    return;
  }

  const statusLabel = { paid: "Paid", pending: "Pending", defaulted: "Defaulted" };
  const fmt = n => `₦${n.toLocaleString()}`;

  try {
    const res = await fetch(`${API_ORIGIN}/api/groups/${groupId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) { window.location.href = "auth.html"; return; }
    if (!res.ok) {
      document.getElementById("planName").textContent = "Group not found";
      return;
    }

    const g = await res.json();

    document.getElementById("planDot").style.background = g.color || "#6B7280";
    document.getElementById("planName").textContent = g.plan;
    document.getElementById("planSeats").textContent = `${g.seatsFilled}/${g.seatsTotal} seats filled`;

    const statusEl = document.getElementById("paymentStatus");
    statusEl.textContent = statusLabel[g.paymentStatus] || g.paymentStatus || "—";
    statusEl.classList.add(`status-pill--${g.paymentStatus || "paid"}`);

    document.getElementById("nextPaymentDate").textContent = g.nextPaymentDate || "—";
    document.getElementById("yourPrice").textContent = fmt(g.yourPrice);

    document.getElementById("soloPrice").textContent = fmt(g.soloPrice);
    document.getElementById("miniYourPrice").textContent = fmt(g.yourPrice);
    document.getElementById("miniSaved").textContent = fmt(g.soloPrice - g.yourPrice);

    document.getElementById("managerName").textContent = g.manager;
    document.getElementById("managerInitial").textContent = g.manager.charAt(0);

    // No per-group notifications table exists yet — honest empty state rather than fake data.
    document.getElementById("groupNotifList").hidden = true;
    document.getElementById("groupNotifEmpty").hidden = false;

    // Managers don't get a "leave" button here — that's not built yet (backend rejects it too).
    const leaveBtn = document.getElementById("leaveGroupBtn");
    if (g.yourRole === "manager") {
      leaveBtn.closest("section").hidden = true;
    } else {
      leaveBtn.addEventListener("click", async () => {
        if (!confirm(`Leave your ${g.plan} group? This frees your seat for someone else.`)) return;

        leaveBtn.disabled = true;
        leaveBtn.textContent = "Leaving…";

        try {
          const leaveRes = await fetch(`${API_ORIGIN}/api/groups/${groupId}/leave`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await leaveRes.json();

          if (!leaveRes.ok) {
            alert(data.error || "Couldn't leave the group.");
            leaveBtn.disabled = false;
            leaveBtn.textContent = "Leave this group";
            return;
          }

          window.location.href = "dashboard.html";
        } catch {
          alert("Network error — try again.");
          leaveBtn.disabled = false;
          leaveBtn.textContent = "Leave this group";
        }
      });
    }
  } catch (err) {
    document.getElementById("planName").textContent = "Couldn't load this group";
  }
});