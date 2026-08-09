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
    const res = await fetch(`${API_ORIGIN}/api/health`);
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
            <div class="admin-list__meta">₦${p.solo_price.toLocaleString()}/mo solo price</div>
          </div>
          <button type="button" class="admin-action-btn admin-action-btn--danger owner-delete-plan-btn" data-id="${p.id}" data-name="${p.name}">Delete</button>
        </li>
      `).join("");

      existingPlansList.querySelectorAll(".owner-delete-plan-btn").forEach(btn => {
        btn.addEventListener("click", () => confirmDeletePlan(btn.dataset.id, btn.dataset.name));
      });
    } catch {
      existingPlansEmpty.hidden = false;
    }
  }

  addPlanForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    addPlanMessage.hidden = true;

    const name = document.getElementById("planName").value.trim();
    const solo_price = Number(document.getElementById("planSoloPrice").value);
    const logo = document.getElementById("planLogo").value.trim() || null;
    const color = document.getElementById("planColor").value.trim() || null;

    if (!name || !solo_price || solo_price <= 0) {
      addPlanMessage.textContent = "Enter a plan name and a valid solo price.";
      addPlanMessage.className = "auth-message auth-message--error";
      addPlanMessage.hidden = false;
      return;
    }

    addPlanSubmit.disabled = true;
    addPlanSubmit.textContent = "Adding…";

    try {
      const res = await fetch(`${API_BASE}/plans`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, solo_price, logo, color }),
      });
      const data = await res.json();

      if (!res.ok) {
        addPlanMessage.textContent = data.error || "Couldn't add that plan.";
        addPlanMessage.className = "auth-message auth-message--error";
        addPlanMessage.hidden = false;
      } else {
        addPlanMessage.textContent = data.message || "Plan added.";
        addPlanMessage.className = "auth-message auth-message--success";
        addPlanMessage.hidden = false;
        addPlanForm.reset();
        loadPlans();
      }
    } catch {
      addPlanMessage.textContent = "Network error — try again.";
      addPlanMessage.className = "auth-message auth-message--error";
      addPlanMessage.hidden = false;
    }

    addPlanSubmit.disabled = false;
    addPlanSubmit.textContent = "Add plan";
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

      loadPlans();
    } catch {
      addPlanMessage.textContent = "Network error — try again.";
      addPlanMessage.className = "auth-message auth-message--error";
      addPlanMessage.hidden = false;
    }
  }

  loadPlans();
});