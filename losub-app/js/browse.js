 document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  const fmt = n => `₦${n.toLocaleString()}`;
  let searchTerm = "";
  let catalogPlans = [];   // from /api/plans — every plan that exists
  let openGroups = [];     // from /api/groups/browse — groups with free seats
  let activePlan = null;   // plan selected in the "become manager" modal

  // A catalog plan with no open (joinable) group becomes a "become manager" card.
  function getDisplayItems() {
    const items = openGroups.map(g => ({
      kind: "join",
      planId: g.planId,
      groupId: g.id,
      name: g.plan,
      logo: g.logo,
      color: g.color,
      price: g.yourPrice,
      soloPrice: g.soloPrice,
      seatsFilled: g.seatsFilled,
      seatsTotal: g.seatsTotal,
    }));

    const openPlanIds = new Set(openGroups.map(g => g.planId));
    catalogPlans
      .filter(p => !openPlanIds.has(p.id))
      .forEach(p => {
        items.push({
          kind: "manager",
          planId: p.id,
          name: p.name,
          logo: p.logo,
          color: p.color,
          soloPrice: p.solo_price,
        });
      });

    return items;
  }

  function getVisibleItems() {
    return getDisplayItems().filter(item =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  function renderTopPlans() {
    const row = document.getElementById("newOffersRow");
    const featured = getDisplayItems().filter(i => i.kind === "join").slice(0, 8);

    row.innerHTML = featured.map(p => `
      <article class="offer-card">
        <img src="${p.logo || fallbackLogo(p.name)}" alt="${p.name}" class="offer-card__logo" style="background:${(p.color || '#111827')}1A;" />
        <span class="offer-card__manager">Managed by Losub</span>
        <span class="offer-card__plan">Shares <strong>${p.name}</strong></span>
        <div class="offer-card__contribution">
          <span class="offer-card__contribution-label">Your contribution</span>
          <span class="offer-card__contribution-value">${fmt(p.price)}<small>/mo</small></span>
        </div>
        <button type="button" class="offer-card__cta" data-group-id="${p.groupId}">Join</button>
      </article>
    `).join("");
  }

  function fallbackLogo(name) {
    return `https://cdn.simpleicons.org/${name.toLowerCase().replace(/\s+/g, "")}/6B7280`;
  }

  function renderPlanGrid() {
    const grid = document.getElementById("planGrid");
    const empty = document.getElementById("planEmpty");
    const visible = getVisibleItems();

    if (!visible.length) {
      grid.hidden = true;
      empty.hidden = false;
      return;
    }
    grid.hidden = false;
    empty.hidden = true;

    grid.innerHTML = visible.map(p => {
      const isManagerCard = p.kind === "manager";
      const cta = isManagerCard
        ? `<button type="button" class="plan-card__cta plan-card__cta--full" data-plan-id="${p.planId}" data-become-manager="1">No group yet — Become manager</button>`
        : `<button type="button" class="plan-card__cta" data-group-id="${p.groupId}">Join</button>`;
      const seatsLine = isManagerCard ? "No open group yet" : `${p.seatsFilled}/${p.seatsTotal} seats filled`;
      const priceLine = isManagerCard ? fmt(p.soloPrice) : fmt(p.price);

      return `
        <article class="plan-card ${isManagerCard ? 'plan-card--full' : ''}">
          <img src="${p.logo || fallbackLogo(p.name)}" alt="${p.name}" class="plan-card__icon" style="background:${(p.color || '#111827')}1A;" />
          <span class="plan-card__name">${p.name}</span>
          <span class="plan-card__seats">${seatsLine}</span>
          <div class="plan-card__bottom">
            <span class="plan-card__price">${priceLine}<small>/mo</small></span>
          </div>
          ${cta}
        </article>
      `;
    }).join("");
  }

  function renderAll() {
    renderTopPlans();
    renderPlanGrid();
  }

  // ---------- Search ----------
  document.getElementById("planSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderPlanGrid();
  });

  // Category chips are currently decorative — plans have no category field in the database yet.
  document.getElementById("categoryGrid").addEventListener("click", (e) => {
    const chip = e.target.closest(".category-chip");
    if (!chip) return;
    document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("is-active"));
    chip.classList.add("is-active");
  });
  document.querySelector('.category-chip[data-cat="all"]').classList.add("is-active");

  // ---------- Join a group (real, instant wallet deduction) ----------
  async function joinGroup(groupId, btn) {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Joining…";

    try {
      const res = await fetch(`${API_ORIGIN}/api/groups/${groupId}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Couldn't join this group.");
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }

      window.location.href = "dashboard.html";
    } catch (err) {
      alert("Network error — try again.");
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  function handleGridClick(e) {
    const joinBtn = e.target.closest("[data-group-id]");
    if (joinBtn) {
      joinGroup(joinBtn.dataset.groupId, joinBtn);
      return;
    }
    const managerBtn = e.target.closest("[data-become-manager]");
    if (managerBtn) {
      const plan = catalogPlans.find(p => String(p.id) === managerBtn.dataset.planId);
      if (plan) openManagerModal(plan);
    }
  }

  document.getElementById("newOffersRow").addEventListener("click", handleGridClick);
  document.getElementById("planGrid").addEventListener("click", handleGridClick);

  // ---------- Manager offer modal (real — creates a group) ----------
  function openManagerModal(plan) {
    activePlan = plan;
    document.getElementById("modalPlanName").textContent = plan.name;
    document.getElementById("modalManagerPrice").textContent = fmt(Math.round(plan.solo_price / 4));
    document.getElementById("managerModalOverlay").hidden = false;
  }

  function closeManagerModal() {
    document.getElementById("managerModalOverlay").hidden = true;
    activePlan = null;
  }

  document.getElementById("modalClose").addEventListener("click", closeManagerModal);
  document.getElementById("managerModalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "managerModalOverlay") closeManagerModal();
  });

  document.getElementById("acceptManagerOffer").addEventListener("click", async () => {
    if (!activePlan) return;
    const btn = document.getElementById("acceptManagerOffer");
    btn.disabled = true;
    btn.textContent = "Creating group…";

    try {
      const res = await fetch(`${API_ORIGIN}/api/groups`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan_id: activePlan.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        // 409 = someone else just opened a group for this plan (race with another manager
        // signing up seconds earlier) — send them to join it instead of retrying blindly.
        if (res.status === 409 && data.groupId) {
          alert(data.error || "A group for this plan just opened up — joining it instead.");
          window.location.href = "dashboard.html";
          return;
        }
        alert(data.error || "Couldn't create the group.");
        btn.disabled = false;
        btn.textContent = "Accept and continue";
        return;
      }

      // The group is already committed on the server at this point (POST /api/groups is
      // atomic — see routes/groups.js), so a normal navigation to the dashboard is enough
      // for it to show up immediately; no extra refresh needed since dashboard.js always
      // fetches fresh, uncached data on load.
      window.location.href = "dashboard.html";
    } catch (err) {
      alert("Network error — try again.");
      btn.disabled = false;
      btn.textContent = "Accept and continue";
    }
  });

  document.getElementById("declineManagerOffer").addEventListener("click", () => {
    closeManagerModal();
    // Waitlist has no backend table yet — this is a no-op for now.
    window.location.href = "dashboard.html";
  });

  // ---------- FAQ accordion ----------
  document.querySelectorAll(".faq-item__question").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const isOpen = item.classList.contains("is-open");
      document.querySelectorAll(".faq-item").forEach(i => {
        i.classList.remove("is-open");
        i.querySelector(".faq-item__question").setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        item.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  // ---------- Load real data ----------
  async function loadData() {
    try {
      const [plansRes, groupsRes] = await Promise.all([
        fetch(`${API_ORIGIN}/api/plans`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_ORIGIN}/api/groups/browse`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (plansRes.status === 401 || groupsRes.status === 401) {
        window.location.href = "auth.html";
        return;
      }

      const plansData = await plansRes.json();
      const groupsData = await groupsRes.json();

      catalogPlans = plansData.plans || [];
      openGroups = groupsData.groups || [];
    } catch (err) {
      catalogPlans = [];
      openGroups = [];
    }
    renderAll();
  }

  loadData();
});