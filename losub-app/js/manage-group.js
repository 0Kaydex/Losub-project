document.addEventListener("DOMContentLoaded", () => {

  // ---- Mock data — replace with a real fetch keyed by group/plan id ----
  const group = {
    planId: "p4",
    planName: "Netflix",
    logo: "https://cdn.simpleicons.org/netflix/E50914",
    color: "#E50914",
    seatsTotal: 4,
    pricePerSeat: 1500,
    inviteLink: "https://losub.app/join/netflix-9F3A",
  };

  let members = [
    { id: "m1", name: "Tunde A.", email: "tunde@email.com", status: "active", joined: "Jan 2026" },
    { id: "m2", name: "Blessing U.", email: "blessing@email.com", status: "active", joined: "Feb 2026" },
    { id: "m3", name: "Chika N.", email: "chika@email.com", status: "pending", joined: "Invited 2 days ago" },
  ];
  // ---- End mock data ----

  const fmt = n => `₦${n.toLocaleString()}`;
  const initials = name => name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  let pendingRemoveId = null;
  let targetSeatIndex = null; // which empty seat slot was clicked to invite into

  // ---------- Summary card ----------
  function renderSummary() {
    const filled = members.length;
    const pct = Math.min(100, Math.round((filled / group.seatsTotal) * 100));

    document.getElementById("groupSummary").innerHTML = `
      <img src="${group.logo}" alt="${group.planName}" class="group-summary__icon" style="background:${group.color}1A;" />
      <div class="group-summary__info">
        <div class="group-summary__name">${group.planName}</div>
        <div class="group-summary__role">You're the account manager</div>
        <div class="group-summary__progress">
          <div class="group-summary__progress-bar" style="width:${pct}%;"></div>
        </div>
        <div class="group-summary__seats-label">${filled}/${group.seatsTotal} seats filled</div>
      </div>
      <div class="group-summary__price">
        <div class="group-summary__price-value">${fmt(group.pricePerSeat)}<small>/seat/mo</small></div>
        <div class="group-summary__price-label">Charged to each member</div>
      </div>
    `;
  }

  // ---------- Seat grid (filled + empty slots) ----------
  function renderSeats() {
    const grid = document.getElementById("seatGrid");
    const emptySeats = group.seatsTotal - members.length;

    let html = members.map(m => `
      <div class="seat-card">
        <span class="seat-card__avatar">${initials(m.name)}</span>
        <div class="seat-card__body">
          <div class="seat-card__name">${m.name}</div>
          <div class="seat-card__meta">${m.status === "pending" ? m.joined : `Joined ${m.joined} · ${m.email}`}</div>
          <span class="seat-card__status seat-card__status--${m.status}">${m.status === "pending" ? "Pending" : "Active"}</span>
        </div>
        <button type="button" class="seat-card__remove" data-id="${m.id}">Remove</button>
      </div>
    `).join("");

    for (let i = 0; i < emptySeats; i++) {
      html += `
        <div class="seat-card seat-card--empty" data-empty-index="${i}">
          <div class="seat-card__body">
            <div class="seat-card__name">Empty seat</div>
            <button type="button" class="seat-card__invite-btn" data-empty-index="${i}">Invite member</button>
          </div>
        </div>
      `;
    }

    grid.innerHTML = html;
    document.getElementById("seatCountLabel").textContent = `${members.length}/${group.seatsTotal} filled`;
  }

  function renderAll() {
    renderSummary();
    renderSeats();
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("mgToast");
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  // ---------- Invite modal ----------
  const inviteOverlay = document.getElementById("inviteModalOverlay");
  const inviteForm = document.getElementById("inviteForm");
  const inviteInput = document.getElementById("inviteInput");
  const inviteError = document.getElementById("inviteError");

  function openInviteModal(seatIndex) {
    targetSeatIndex = seatIndex;
    inviteInput.value = "";
    inviteError.hidden = true;
    inviteOverlay.hidden = false;
    inviteInput.focus();
  }

  function closeInviteModal() {
    inviteOverlay.hidden = true;
    targetSeatIndex = null;
  }

  document.getElementById("inviteModalClose").addEventListener("click", closeInviteModal);
  inviteOverlay.addEventListener("click", (e) => {
    if (e.target.id === "inviteModalOverlay") closeInviteModal();
  });

  document.getElementById("seatGrid").addEventListener("click", (e) => {
    const inviteBtn = e.target.closest("[data-empty-index]");
    const removeBtn = e.target.closest(".seat-card__remove");

    if (inviteBtn) {
      openInviteModal(inviteBtn.dataset.emptyIndex);
      return;
    }
    if (removeBtn) {
      openRemoveModal(removeBtn.dataset.id);
    }
  });

  inviteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = inviteInput.value.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    const isPhone = /^[0-9+()\-\s]{7,}$/.test(val);

    if (!val || (!isEmail && !isPhone)) {
      inviteError.hidden = false;
      return;
    }

    members.push({
      id: `m${Date.now()}`,
      name: isEmail ? val.split("@")[0] : val,
      email: isEmail ? val : "—",
      status: "pending",
      joined: "Invited just now",
    });

    closeInviteModal();
    renderAll();
    showToast(`Invite sent to ${val}`);
  });

  document.getElementById("copyInviteLink").addEventListener("click", () => {
    navigator.clipboard?.writeText(group.inviteLink).then(() => {
      closeInviteModal();
      showToast("Invite link copied to clipboard");
    }).catch(() => {
      showToast("Couldn't copy link — try again");
    });
  });

  // ---------- Remove member modal ----------
  const removeOverlay = document.getElementById("removeModalOverlay");

  function openRemoveModal(memberId) {
    const member = members.find(m => m.id === memberId);
    if (!member) return;
    pendingRemoveId = memberId;
    document.getElementById("removeMemberName").textContent = member.name;
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

  document.getElementById("confirmRemove").addEventListener("click", () => {
    if (!pendingRemoveId) return;
    const removed = members.find(m => m.id === pendingRemoveId);
    members = members.filter(m => m.id !== pendingRemoveId);
    closeRemoveModal();
    renderAll();
    showToast(`${removed.name} was removed from the group`);
  });

  // ---------- Initial render ----------
  renderAll();
});