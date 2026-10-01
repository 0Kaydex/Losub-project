document.addEventListener("DOMContentLoaded", async () => {

  // API_BASE_URL comes from js/config.js (must be loaded before this file) —
  // it resolves to your local backend automatically when running on
  // localhost/127.0.0.1, and to production otherwise.
  const API_BASE = API_BASE_URL;

  const user = JSON.parse(localStorage.getItem("losub_user"));
  const token = localStorage.getItem("losub_token");

  if (!user || !token) {
    window.location.href = "/login";
    return;
  }
  if (user.role !== "owner") {
    window.location.href = "/home";
    return;
  }

  const healthDot = document.getElementById("healthDot");
  const healthText = document.getElementById("healthText");
  const healthMeta = document.getElementById("healthMeta");
  const accountInfoList = document.getElementById("accountInfoList");

  // ---------- Account info (from local session, always available) ----------
  accountInfoList.innerHTML = `
    <li><div class="admin-list__name">Name</div><div class="admin-list__meta">${user.fullname}</div></li>
    <li><div class="admin-list__name">Email</div><div class="admin-list__meta">${user.email}</div></li>
    <li><div class="admin-list__name">Role</div><div class="admin-list__meta">${user.role}</div></li>
  `;

  // ---------- Backend health check ----------
  try {
    const started = performance.now();
    const res = await fetch(`${API_BASE}/health`);
    const elapsed = Math.round(performance.now() - started);

    if (!res.ok) throw new Error("Bad status");
    const data = await res.json();

    healthDot.classList.add("owner-status-dot--ok");
    healthText.textContent = data.message || "Backend is running.";
    healthMeta.textContent = `Responded in ${elapsed}ms.`;
  } catch (err) {
    healthDot.classList.add("owner-status-dot--error");
    healthText.textContent = "Backend unreachable.";
    healthMeta.textContent = "Couldn't reach /api/health — check the deployment.";
  }

  // ---------- Plan catalog ----------
  const existingPlansList = document.getElementById("existingPlansList");
  const existingPlansEmpty = document.getElementById("existingPlansEmpty");
  const addPlanForm = document.getElementById("addPlanForm");
  const addPlanMessage = document.getElementById("addPlanMessage");
  const addPlanSubmit = document.getElementById("addPlanSubmit");
  const planFormTitle = document.getElementById("planFormTitle");
  const planFormHint = document.getElementById("planFormHint");
  const cancelEditPlanBtn = document.getElementById("cancelEditPlanBtn");

  let editingPlanId = null;
  let cachedPlans = [];

  function resetPlanForm() {
    editingPlanId = null;
    addPlanForm.reset();
    document.getElementById("planDefaultSeats").value = 4;
    document.getElementById("planMarginPreview").textContent = "";
    if (planFormTitle) planFormTitle.textContent = "Add a plan";
    if (planFormHint) planFormHint.textContent = "Add a subscription plan to the catalog. Once added, anyone can start a group for it from Browse plans.";
    addPlanSubmit.textContent = "Add plan";
    addPlanSubmit.disabled = false;
    if (cancelEditPlanBtn) cancelEditPlanBtn.hidden = true;
  }

  if (cancelEditPlanBtn) {
    cancelEditPlanBtn.addEventListener("click", () => {
      resetPlanForm();
      addPlanMessage.hidden = true;
    });
  }

  function startEditPlan(id) {
    const p = cachedPlans.find(plan => String(plan.id) === String(id));
    if (!p) return;

    editingPlanId = p.id;
    document.getElementById("planName").value = p.name;
    document.getElementById("planSoloPrice").value = p.solo_price;
    document.getElementById("planPricePerSeat").value = p.price_per_seat ?? "";
    document.getElementById("planFamilyPrice").value = p.family_price ?? "";
    document.getElementById("planDefaultSeats").value = p.default_seats ?? 4;
    document.getElementById("planLogo").value = p.logo || "";
    document.getElementById("planColor").value = p.color || "";

    if (planFormTitle) planFormTitle.textContent = `Edit plan: ${p.name}`;
    if (planFormHint) planFormHint.textContent = "Updating price per seat will propagate to all groups using this plan.";
    addPlanSubmit.textContent = "Save changes";
    if (cancelEditPlanBtn) cancelEditPlanBtn.hidden = false;
    addPlanMessage.hidden = true;

    updateMarginPreview();
    addPlanForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadPlans() {
    try {
      const res = await fetch(`${API_BASE}/plans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      cachedPlans = data.plans || [];

      if (!cachedPlans.length) {
        existingPlansList.innerHTML = "";
        existingPlansEmpty.hidden = false;
        return;
      }
      existingPlansEmpty.hidden = true;
      existingPlansList.innerHTML = cachedPlans.map(p => {
        const seatLine = p.price_per_seat != null
          ? `₦${p.price_per_seat.toLocaleString()}/seat × ${p.default_seats} seats`
          : "Seat price not set";
        const marginLine = p.margin != null
          ? ` · <strong>₦${p.margin.toLocaleString()}/mo margin</strong>`
          : "";
        const canEdit = user.role === "admin" || (p.owner_id != null && p.owner_id === user.id);
        const ownerTag = p.owner_id == null
          ? ` · <span style="font-size:11px;color:var(--ink-soft);">(Legacy plan)</span>`
          : (p.owner_id === user.id
            ? ` · <span style="font-size:11px;color:#1E8A46;font-weight:600;">(Your plan)</span>`
            : "");

        return `
          <li>
            <div>
              <div class="admin-list__name">${p.name}</div>
              <div class="admin-list__meta">₦${p.solo_price.toLocaleString()}/mo solo · ${seatLine}${marginLine}${ownerTag}</div>
            </div>
            <div style="display: flex; gap: 8px;">
              ${canEdit ? `
                <button type="button" class="admin-action-btn owner-edit-plan-btn" data-id="${p.id}">Edit</button>
                <button type="button" class="admin-action-btn admin-action-btn--danger owner-delete-plan-btn" data-id="${p.id}" data-name="${p.name}">Delete</button>
              ` : `
                <button type="button" class="admin-action-btn" disabled title="Only the plan creator or an admin can edit this plan" style="opacity:0.5;cursor:not-allowed;">Edit</button>
                <button type="button" class="admin-action-btn admin-action-btn--danger" disabled title="Only the plan creator or an admin can delete this plan" style="opacity:0.5;cursor:not-allowed;">Delete</button>
              `}
            </div>
          </li>
        `;
      }).join("");

      existingPlansList.querySelectorAll(".owner-edit-plan-btn").forEach(btn => {
        btn.addEventListener("click", () => startEditPlan(btn.dataset.id));
      });

      existingPlansList.querySelectorAll(".owner-delete-plan-btn").forEach(btn => {
        btn.addEventListener("click", () => confirmDeletePlan(btn.dataset.id, btn.dataset.name));
      });
    } catch {
      existingPlansEmpty.hidden = false;
    }
  }

  // ---------- Live margin preview as the owner fills the form in ----------
  function updateMarginPreview() {
    const pricePerSeat = Number(document.getElementById("planPricePerSeat").value);
    const familyPrice = Number(document.getElementById("planFamilyPrice").value);
    const seats = Number(document.getElementById("planDefaultSeats").value);
    const preview = document.getElementById("planMarginPreview");

    if (pricePerSeat > 0 && familyPrice > 0 && seats > 0) {
      const margin = pricePerSeat * seats - familyPrice;
      preview.textContent = `≈ ₦${margin.toLocaleString()}/month margin (₦${pricePerSeat.toLocaleString()} × ${seats} seats − ₦${familyPrice.toLocaleString()} cost)`;
      preview.style.color = margin >= 0 ? "#1E8A46" : "#C0392B";
    } else {
      preview.textContent = "";
    }
  }
  ["planPricePerSeat", "planFamilyPrice", "planDefaultSeats"].forEach(id => {
    document.getElementById(id).addEventListener("input", updateMarginPreview);
  });

  addPlanForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    addPlanMessage.hidden = true;

    const name = document.getElementById("planName").value.trim();
    const solo_price = Number(document.getElementById("planSoloPrice").value);
    const price_per_seat = Number(document.getElementById("planPricePerSeat").value);
    const family_price = Number(document.getElementById("planFamilyPrice").value);
    const default_seats = Number(document.getElementById("planDefaultSeats").value) || 4;
    const logo = document.getElementById("planLogo").value.trim() || null;
    const color = document.getElementById("planColor").value.trim() || null;

    if (!name || !solo_price || solo_price <= 0) {
      addPlanMessage.textContent = "Enter a plan name and a valid solo price.";
      addPlanMessage.className = "auth-message auth-message--error";
      addPlanMessage.hidden = false;
      return;
    }
    if (!price_per_seat || price_per_seat <= 0 || !family_price || family_price <= 0) {
      addPlanMessage.textContent = "Enter a valid price per seat and family plan cost.";
      addPlanMessage.className = "auth-message auth-message--error";
      addPlanMessage.hidden = false;
      return;
    }

    addPlanSubmit.disabled = true;
    addPlanSubmit.textContent = editingPlanId ? "Saving…" : "Adding…";

    try {
      const endpoint = editingPlanId ? `${API_BASE}/plans/${editingPlanId}` : `${API_BASE}/plans`;
      const method = editingPlanId ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, solo_price, price_per_seat, family_price, default_seats, logo, color }),
      });
      const data = await res.json();

      if (!res.ok) {
        addPlanMessage.textContent = data.error || (editingPlanId ? "Couldn't update that plan." : "Couldn't add that plan.");
        addPlanMessage.className = "auth-message auth-message--error";
        addPlanMessage.hidden = false;
      } else {
        addPlanMessage.textContent = data.message || (editingPlanId ? "Plan updated." : "Plan added.");
        addPlanMessage.className = "auth-message auth-message--success";
        addPlanMessage.hidden = false;
        resetPlanForm();
        loadPlans();
      }
    } catch {
      addPlanMessage.textContent = "Couldn't reach Losub — check your connection and try again.";
      addPlanMessage.className = "auth-message auth-message--error";
      addPlanMessage.hidden = false;
    }

    addPlanSubmit.disabled = false;
    if (editingPlanId) {
      addPlanSubmit.textContent = "Save changes";
    } else {
      addPlanSubmit.textContent = "Add plan";
    }
  });

  async function confirmDeletePlan(id, name) {
    if (!confirm(`Delete "${name}" from the plan catalog? This can't be undone.`)) return;

    try {
      const res = await fetch(`${API_BASE}/plans/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        addPlanMessage.textContent = data.error || "Couldn't delete that plan.";
        addPlanMessage.className = "auth-message auth-message--error";
        addPlanMessage.hidden = false;
        return;
      }

      if (editingPlanId && String(editingPlanId) === String(id)) {
        resetPlanForm();
      }
      loadPlans();
    } catch {
      addPlanMessage.textContent = "Couldn't reach Losub — check your connection and try again.";
      addPlanMessage.className = "auth-message auth-message--error";
      addPlanMessage.hidden = false;
    }
  }

  loadPlans();
});