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

  const statusLabel = { paid: "Paid", pending: "Pending", defaulted: "Defaulted", overdue: "Overdue" };
  const fmt = n => `₦${n.toLocaleString()}`;

  async function loadGroupNotifications() {
    // Scoped to this group only (?groupId=), instead of the user's whole feed.
    const list = document.getElementById("groupNotifList");
    const empty = document.getElementById("groupNotifEmpty");
    try {
      const notifRes = await fetch(`${API_ORIGIN}/api/notifications?groupId=${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const notifData = await notifRes.json();
      const recent = (notifData.notifications || []).slice(0, 5);

      if (!recent.length) {
        list.hidden = true;
        empty.hidden = false;
        return;
      }
      list.hidden = false;
      empty.hidden = true;
      list.innerHTML = recent.map(n => `
        <li class="notif-item ${n.read ? 'is-read' : ''}">
          <span class="notif-item__dot"></span>
          <div class="notif-item__body">
            <p>${n.link ? `<a href="${n.link}" target="_blank" rel="noopener">${n.text}</a>` : n.text}</p>
          </div>
        </li>
      `).join("");
    } catch {
      list.hidden = true;
      empty.hidden = false;
    }
  }

  // ---------- Group messages (manager <-> members) ----------
  let myUserFullname = null;

  async function loadGroupMessages() {
    const thread = document.getElementById("groupMsgThread");
    const empty = document.getElementById("groupMsgEmpty");
    try {
      const res = await fetch(`${API_ORIGIN}/api/messages/group/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const messages = data.messages || [];

      if (!messages.length) {
        thread.hidden = true;
        empty.hidden = false;
        return;
      }
      thread.hidden = false;
      empty.hidden = true;
      thread.innerHTML = messages.map(m => `
        <div class="mw-msg ${m.sender_name === myUserFullname ? 'mw-msg--mine' : 'mw-msg--theirs'}">
          <span class="mw-msg__meta">${m.sender_name} · ${m.sender_role}</span>
          ${m.text}
        </div>
      `).join("");
      thread.scrollTop = thread.scrollHeight;
    } catch {
      thread.hidden = true;
      empty.hidden = false;
    }
  }

  document.getElementById("groupMsgForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("groupMsgInput");
    const btn = document.getElementById("groupMsgSend");
    const text = input.value.trim();
    if (!text) return;

    btn.disabled = true;
    try {
      const res = await fetch(`${API_ORIGIN}/api/messages/group/${groupId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        input.value = "";
        loadGroupMessages();
      }
    } catch {
      // silently fail — user can retry
    }
    btn.disabled = false;
  });

  try {
    try {
      const meRes = await fetch(`${API_ORIGIN}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      const meData = await meRes.json();
      myUserFullname = meData.user?.fullname || null;
    } catch {
      myUserFullname = null;
    }

    const res = await fetch(`${API_ORIGIN}/api/groups/${groupId}`, {
      cache: "no-store",
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

    const payBtn = document.getElementById("payNowBtn");
    if (g.paymentStatus === "overdue" || g.paymentStatus === "pending") {
      payBtn.hidden = false;
      payBtn.textContent = `Pay now (${fmt(g.yourPrice)})`;
      payBtn.onclick = async () => {
        payBtn.disabled = true;
        payBtn.textContent = "Processing…";
        try {
          const payRes = await fetch(`${API_ORIGIN}/api/groups/${groupId}/pay`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          const payData = await payRes.json();
          if (!payRes.ok) {
            alert(payData.error || "Payment failed.");
            payBtn.disabled = false;
            payBtn.textContent = `Pay now (${fmt(g.yourPrice)})`;
            return;
          }
          statusEl.textContent = statusLabel.paid;
          statusEl.className = "status-pill status-pill--paid";
          document.getElementById("nextPaymentDate").textContent = payData.nextPaymentDate;
          payBtn.hidden = true;
          loadGroupNotifications();
        } catch {
          alert("Network error — try again.");
          payBtn.disabled = false;
          payBtn.textContent = `Pay now (${fmt(g.yourPrice)})`;
        }
      };
    } else {
      payBtn.hidden = true;
    }

    document.getElementById("soloPrice").textContent = fmt(g.soloPrice);
    document.getElementById("miniYourPrice").textContent = fmt(g.yourPrice);
    document.getElementById("miniSaved").textContent = fmt(g.soloPrice - g.yourPrice);

    document.getElementById("managerName").textContent = g.manager;
    document.getElementById("managerInitial").textContent = g.manager.charAt(0);

    if (g.accessLink) {
      document.getElementById("accessPanel").hidden = false;
      document.getElementById("accessLinkOut").href = g.accessLink;
    }

    loadGroupNotifications();
    loadGroupMessages();

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