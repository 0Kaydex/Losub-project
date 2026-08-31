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

  const fmt = n => `₦${n.toLocaleString()}`;
  const initials = name => name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  let group = null;
  let members = [];
  let pendingRemoveId = null;

  // ---------- Summary card ----------
  function renderSummary() {
    const filled = members.length;
    const pct = Math.min(100, Math.round((filled / group.seatsTotal) * 100));

    document.getElementById("groupSummary").innerHTML = `
      <img src="${group.logo || fallbackLogo(group.plan)}" alt="${group.plan}" class="group-summary__icon" style="background:${(group.color || '#111827')}1A;" />
      <div class="group-summary__info">
        <div class="group-summary__name">${group.plan}</div>
        <div class="group-summary__role">You're the account manager</div>
        <div class="group-summary__progress">
          <div class="group-summary__progress-bar" style="width:${pct}%;"></div>
        </div>
        <div class="group-summary__seats-label">${filled}/${group.seatsTotal} seats filled</div>
      </div>
      <div class="group-summary__price">
        <div class="group-summary__price-value">${fmt(group.yourPrice)}<small>/seat/mo</small></div>
        <div class="group-summary__price-label">Charged to each member</div>
      </div>
    `;
  }

  function fallbackLogo(name) {
    return `https://cdn.simpleicons.org/${name.toLowerCase().replace(/\s+/g, "")}/6B7280`;
  }

  // ---------- Seat grid ----------
  function renderSeats() {
    const grid = document.getElementById("seatGrid");
    const emptySeats = group.seatsTotal - members.length;

    let html = members.map(m => `
      <div class="seat-card">
        <span class="seat-card__avatar">${initials(m.fullname)}</span>
        <div class="seat-card__body">
          <div class="seat-card__name">${m.fullname}</div>
          <div class="seat-card__meta">Joined ${new Date(m.joined_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })} · ${m.email}</div>
          <span class="seat-card__status seat-card__status--active">${m.payment_status === "paid" ? "Active" : m.payment_status}</span>
        </div>
        ${m.role === "manager" ? "" : `<button type="button" class="seat-card__remove" data-id="${m.user_id}">Remove</button>`}
      </div>
    `).join("");

    for (let i = 0; i < emptySeats; i++) {
      html += `
        <div class="seat-card seat-card--empty">
          <div class="seat-card__body">
            <div class="seat-card__name">Empty seat</div>
            <button type="button" class="seat-card__invite-btn" id="openInviteBtn">Share invite link</button>
          </div>
        </div>
      `;
    }

    grid.innerHTML = html;
    document.getElementById("seatCountLabel").textContent = `${members.length}/${group.seatsTotal} filled`;

    const inviteBtn = document.getElementById("openInviteBtn");
    if (inviteBtn) inviteBtn.addEventListener("click", openInviteModal);
  }

  // ---------- Access link ----------
  function renderAccessLink() {
    const currentEl = document.getElementById("accessLinkCurrent");
    const input = document.getElementById("accessLinkInput");
    if (group.accessLink) {
      currentEl.hidden = false;
      currentEl.textContent = `Current link on file: ${group.accessLink}`;
      input.value = group.accessLink;
    } else {
      currentEl.hidden = true;
      input.value = "";
    }
  }

  document.getElementById("accessLinkForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("accessLinkInput");
    const submitBtn = document.getElementById("accessLinkSubmit");
    const link = input.value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      const res = await fetch(`${API_ORIGIN}/api/groups/${groupId}/access-link`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ link }),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Couldn't send the link.");
      } else {
        group.accessLink = data.accessLink;
        renderAccessLink();
        showToast(data.message);
      }
    } catch {
      showToast("Network error — try again.");
    }

    submitBtn.disabled = false;
    submitBtn.textContent = "Send to group";
  });

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("mgToast");
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  // ---------- Invite modal — real link to Browse plans, no fake email sending ----------
  const inviteOverlay = document.getElementById("inviteModalOverlay");

  function openInviteModal() {
    inviteOverlay.hidden = false;
  }
  function closeInviteModal() {
    inviteOverlay.hidden = true;
  }

  document.getElementById("inviteModalClose").addEventListener("click", closeInviteModal);
  inviteOverlay.addEventListener("click", (e) => {
    if (e.target.id === "inviteModalOverlay") closeInviteModal();
  });

  // The invite "form" now just copies a real, working link to Browse plans —
  // there's no email/SMS invite system built yet, so we don't fake one.
  const inviteForm = document.getElementById("inviteForm");
  if (inviteForm) inviteForm.hidden = true;

  document.getElementById("copyInviteLink").addEventListener("click", () => {
    const link = `${window.location.origin}/html/browse.html`;
    navigator.clipboard?.writeText(link).then(() => {
      closeInviteModal();
      showToast("Invite link copied — share it so they can join and pay their own seat.");
    }).catch(() => {
      showToast("Couldn't copy link — try again");
    });
  });

  // ---------- Remove member ----------
  document.getElementById("seatGrid").addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".seat-card__remove");
    if (removeBtn) openRemoveModal(removeBtn.dataset.id);
  });

  const removeOverlay = document.getElementById("removeModalOverlay");

  function openRemoveModal(userId) {
    const member = members.find(m => String(m.user_id) === userId);
    if (!member) return;
    pendingRemoveId = userId;
    document.getElementById("removeMemberName").textContent = member.fullname;
    removeOverlay.hidden = false;
  }

  function closeRemoveModal() {
    removeOverlay.hidden = true;
    pendingRemoveId = null;
  }

  document.getElementById("removeModalClose").addEventListener("click", closeRemoveModal);
  document.getElementById("cancelRemove").addEventListener("click", closeRemoveModal);
  removeOverlay.addEventListener("click", (e) => {
    if (e.target.id === "removeModalOverlay") closeRemoveModal();
  });

  document.getElementById("confirmRemove").addEventListener("click", async () => {
    if (!pendingRemoveId) return;
    const btn = document.getElementById("confirmRemove");
    btn.disabled = true;

    try {
      const res = await fetch(`${API_ORIGIN}/api/groups/${groupId}/members/${pendingRemoveId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Couldn't remove that member.");
      } else {
        const removed = members.find(m => String(m.user_id) === pendingRemoveId);
        members = members.filter(m => String(m.user_id) !== pendingRemoveId);
        renderSummary();
        renderSeats();
        showToast(`${removed.fullname} was removed from the group`);
      }
    } catch {
      showToast("Network error — try again.");
    }

    btn.disabled = false;
    closeRemoveModal();
  });

  // ---------- Initial load ----------
  async function loadGroup() {
    try {
      const [groupRes, membersRes] = await Promise.all([
        fetch(`${API_ORIGIN}/api/groups/${groupId}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_ORIGIN}/api/groups/${groupId}/members`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (groupRes.status === 401 || membersRes.status === 401) {
        window.location.href = "auth.html";
        return;
      }
      if (groupRes.status === 403 || membersRes.status === 403) {
        showToast("You don't manage this group.");
        setTimeout(() => window.location.href = "dashboard.html", 1500);
        return;
      }

      group = await groupRes.json();
      const membersData = await membersRes.json();
      members = membersData.members || [];

      renderSummary();
      renderSeats();
      renderAccessLink();
    } catch (err) {
      showToast("Couldn't load this group. Refresh to try again.");
    }
  }

  loadGroup();
});