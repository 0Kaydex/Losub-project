document.addEventListener("DOMContentLoaded", async () => {

  const API_BASE = "https://api.losubapp.com/api";

  const user = JSON.parse(localStorage.getItem("losub_user"));
  const token = localStorage.getItem("losub_token");

  if (!user || !token) {
    window.location.href = "auth.html";
    return;
  }
  if (user.role !== "owner") {
    window.location.href = "index.html";
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
  const cancelEditBtn = document.getElementById("cancelEditBtn");

  const nameInput = document.getElementById("planName");
  const soloPriceInput = document.getElementById("planSoloPrice");
  const pricePerSeatInput = document.getElementById("planPricePerSeat");
  const groupPriceInput = document.getElementById("planGroupPrice");
  const logoInput = document.getElementById("planLogo");
  const colorInput = document.getElementById("planColor");

  let editingPlanId = null; // null = "add" mode, otherwise the id being edited

  function showMessage(text, type = "error") {
    addPlanMessage.textContent = text;
    addPlanMessage.className = `auth-message auth-message--${type}`;
    addPlanMessage.hidden = false;
  }

  function enterEditMode(plan) {
    editingPlanId = plan.id;
    planFormTitle.textContent = `Editing "${plan.name}"`;
    addPlanSubmit.textContent = "Save changes";
    cancelEditBtn.hidden = false;

    nameInput.value = plan.name;
    soloPriceInput.value = plan.solo_price;
    pricePerSeatInput.value = plan.price_per_seat ?? "";
    groupPriceInput.value = plan.group_price ?? "";
    logoInput.value = plan.logo || "";
    colorInput.value = plan.color || "";

    addPlanForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exitEditMode() {
    editingPlanId = null;
    planFormTitle.textContent = "Add a plan";
    addPlanSubmit.textContent = "Add plan";
    cancelEditBtn.hidden = true;
    addPlanForm.reset();
    addPlanMessage.hidden = true;
  }

  cancelEditBtn.addEventListener("click", exitEditMode);

  async function loadPlans() {
    try {
      const res = await fetch(`${API_BASE}/plans`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const plans = data.plans || [];

      if (!plans.length) {
        existingPlansList.innerHTML = "";
        existingPlansEmpty.hidden = false;
        return;
      }
      existingPlansEmpty.hidden = true;
      existingPlansList.innerHTML = plans.map(p => `
        <li>
          <div>
            <div class="admin-list__name">${p.name}</div>
            <div class="admin-list__meta">
              Solo ₦${p.solo_price.toLocaleString()}/mo
              ${p.price_per_seat != null ? ` · Per seat ₦${p.price_per_seat.toLocaleString()}/mo (manager pays ₦${Math.round(p.price_per_seat / 2).toLocaleString()})` : " · No per-seat price set yet"}
              ${p.group_price != null ? ` · Group cost ₦${p.group_price.toLocaleString()}/mo` : ""}
            </div>
          </div>
          <div class="owner-plan-row-actions">
            <button type="button" class="admin-action-btn owner-edit-plan-btn" data-id="${p.id}">Edit</button>
            <button type="button" class="admin-action-btn admin-action-btn--danger owner-delete-plan-btn" data-id="${p.id}" data-name="${p.name}">Delete</button>
          </div>
        </li>
      `).join("");

      existingPlansList.querySelectorAll(".owner-delete-plan-btn").forEach(btn => {
        btn.addEventListener("click", () => confirmDeletePlan(btn.dataset.id, btn.dataset.name));
      });
      existingPlansList.querySelectorAll(".owner-edit-plan-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const plan = plans.find(p => String(p.id) === btn.dataset.id);
          if (plan) enterEditMode(plan);
        });
      });
    } catch {
      existingPlansEmpty.hidden = false;
    }
  }

  addPlanForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    addPlanMessage.hidden = true;

    const name = nameInput.value.trim();
    const solo_price = Number(soloPriceInput.value);
    const price_per_seat = Number(pricePerSeatInput.value);
    const group_price = groupPriceInput.value ? Number(groupPriceInput.value) : null;
    const logo = logoInput.value.trim() || null;
    const color = colorInput.value.trim() || null;

    if (!name || !solo_price || solo_price <= 0) {
      showMessage("Enter a plan name and a valid solo price.");
      return;
    }
    if (!price_per_seat || price_per_seat <= 0) {
      showMessage("Enter a valid price per seat — this is what each member actually pays.");
      return;
    }

    const isEditing = editingPlanId !== null;
    addPlanSubmit.disabled = true;
    addPlanSubmit.textContent = isEditing ? "Saving…" : "Adding…";

    try {
      const res = await fetch(`${API_BASE}/plans${isEditing ? `/${editingPlanId}` : ""}`, {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, solo_price, price_per_seat, group_price, logo, color }),
      });
      const data = await res.json();

      if (!res.ok) {
        showMessage(data.error || `Couldn't ${isEditing ? "update" : "add"} that plan.`);
      } else {
        showMessage(data.message || (isEditing ? "Plan updated." : "Plan added."), "success");
        exitEditMode();
        loadPlans();
      }
    } catch {
      showMessage("Network error — try again.");
    }

    addPlanSubmit.disabled = false;
    if (editingPlanId === null) addPlanSubmit.textContent = "Add plan";
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
        showMessage(data.error || "Couldn't delete that plan.");
        return;
      }

      if (editingPlanId === id) exitEditMode();
      loadPlans();
    } catch {
      showMessage("Network error — try again.");
    }
  }

  loadPlans();
});
