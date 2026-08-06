document.addEventListener("DOMContentLoaded", () => {

  // ---- Mock data — replace with a real fetch ----
  // `logo` points to Simple Icons' public CDN: https://cdn.simpleicons.org/{slug}/{hexColorNoHash}
  // See the note at the bottom of this file for how to swap in your own logo files instead.
  const plans = [
    { id: "p1", name: "Spotify", category: "music", logo: "https://cdn.simpleicons.org/spotify/1DB954", color: "#1DB954", seatsFilled: 4, seatsTotal: 6, price: 800, soloPrice: 3200, managerPrice: 300, manager: "Ngozi E." },
    { id: "p2", name: "youtube", category: "video", logo: "https://cdn.simpleicons.org/youtube/FF0000", color: "#FF0000", seatsFilled: 4, seatsTotal: 4, price: 900, soloPrice: 3600, managerPrice: 350, manager: "Ifeoma K." },
    { id: "p3", name: "Capcut", category: "productivity", logo: "https://cdn.simpleicons.org/capcut/000000", color: "#111827", seatsFilled: 1, seatsTotal: 2, price: 2700, soloPrice: 5400, managerPrice: 1200, manager: "David O." },
    { id: "p4", name: "Netflix", category: "video", logo: "https://cdn.simpleicons.org/netflix/E50914", color: "#E50914", seatsFilled: 3, seatsTotal: 4, price: 1500, soloPrice: 5200, managerPrice: 600, manager: "Tunde A." },
    { id: "p5", name: "Amazon Music", category: "music", logo: "https://cdn.simpleicons.org/amazonmusic/4A9EE0", color: "#2E8FD8", seatsFilled: 2, seatsTotal: 6, price: 700, soloPrice: 2800, managerPrice: 250, manager: "Blessing U." },
    { id: "p6", name: "Microsoft 365", category: "productivity", logo: "https://cdn.simpleicons.org/microsoft365/D83B01", color: "#D83B01", seatsFilled: 5, seatsTotal: 5, price: 1200, soloPrice: 6000, managerPrice: 500, manager: "Samuel T." },
    { id: "p7", name: "Prime Video", category: "video", logo: "https://cdn.simpleicons.org/primevideo/00A8E1", color: "#00A8E1", seatsFilled: 4, seatsTotal: 5, price: 1100, soloPrice: 4400, managerPrice: 450, manager: "Chika N." },
    { id: "p8", name: "Disney+", category: "video", logo: "https://cdn.simpleicons.org/disneyplus/113CCF", color: "#113CCF", seatsFilled: 3, seatsTotal: 6, price: 1300, soloPrice: 4800, managerPrice: 550, manager: "Femi A." },
    { id: "p9", name: "Canva", category: "productivity", logo: "https://cdn.simpleicons.org/canva/00C4CC", color: "#00C4CC", seatsFilled: 2, seatsTotal: 5, price: 950, soloPrice: 3800, managerPrice: 400, manager: "Amaka O." },
    { id: "p10", name: "Duolingo", category: "productivity", logo: "https://cdn.simpleicons.org/duolingo/58CC02", color: "#58CC02", seatsFilled: 1, seatsTotal: 6, price: 500, soloPrice: 2000, managerPrice: 200, manager: "Yusuf B." },
  ];

  // The fixed set shown in "Top plans" — always these 8, regardless of search/category filters
  const TOP_PLAN_IDS = ["p1", "p4", "p2", "p8", "p7", "p6", "p9", "p10"];
  // ---- End mock data ----

  const fmt = n => `₦${n.toLocaleString()}`;
  let searchTerm = "";
  let currentCat = "all";
  let activePlan = null;

  function getVisiblePlans() {
    return plans.filter(p => {
      const matchesCat = currentCat === "all" || p.category === currentCat;
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }

  // ---------- Top plans row (fixed curated set) ----------
  function renderTopPlans() {
    const row = document.getElementById("newOffersRow");
    const topPlans = TOP_PLAN_IDS.map(id => plans.find(p => p.id === id)).filter(Boolean);

    row.innerHTML = topPlans.map(p => `
      <article class="offer-card">
        <img src="${p.logo}" alt="${p.name}" class="offer-card__logo" style="background:${p.color}1A;" />
        <span class="offer-card__manager">${p.manager}</span>
        <span class="offer-card__plan">Shares <strong>${p.name}</strong></span>
        <div class="offer-card__contribution">
          <span class="offer-card__contribution-label">Your contribution</span>
          <span class="offer-card__contribution-value">${fmt(p.price)}<small>/mo</small></span>
        </div>
        <button type="button" class="offer-card__cta" data-id="${p.id}">Join</button>
      </article>
    `).join("");
  }
// plan grid rendering
 function renderPlanGrid() {
  const grid = document.getElementById("planGrid");
  const empty = document.getElementById("planEmpty");
  const visible = getVisiblePlans();

  if (!visible.length) {
    grid.hidden = true;
    empty.hidden = false;
    return;
  }
  grid.hidden = false;
  empty.hidden = true;

  grid.innerHTML = visible.map(p => {
    const isFull = p.seatsFilled >= p.seatsTotal;
    const joinBtn = isFull
      ? ""
      : `<button type="button" class="plan-card__cta" data-id="${p.id}">Join</button>`;
    const fullBtn = isFull
      ? `<button type="button" class="plan-card__cta plan-card__cta--full" data-id="${p.id}">Full — Become manager</button>`
      : "";

    return `
      <article class="plan-card ${isFull ? 'plan-card--full' : ''}">
        <img src="${p.logo}" alt="${p.name}" class="plan-card__icon" style="background:${p.color}1A;" />
        <span class="plan-card__name">${p.name}</span>
        <span class="plan-card__seats">${p.seatsFilled}/${p.seatsTotal} seats filled</span>
        <div class="plan-card__bottom">
          <span class="plan-card__price">${fmt(p.price)}<small>/mo</small></span>
          ${joinBtn}
        </div>
        ${fullBtn}
      </article>
    `;
  }).join("");
}

  function renderAll() {
    renderTopPlans();
    renderPlanGrid();
  }

  // ---------- Search & category filters ----------
  document.getElementById("planSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderPlanGrid(); // Top plans stays fixed — only the All Plans grid reacts to search
  });

  document.getElementById("categoryGrid").addEventListener("click", (e) => {
    const chip = e.target.closest(".category-chip");
    if (!chip) return;
    document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("is-active"));
    chip.classList.add("is-active");
    currentCat = chip.dataset.cat;
    renderPlanGrid(); // Top plans stays fixed — only the All Plans grid reacts to category
  });
  document.querySelector('.category-chip[data-cat="all"]').classList.add("is-active");

  // ---------- Join / Full click handling (delegated across Top Plans + All Plans) ----------
  function handlePlanClick(e) {
    const btn = e.target.closest("[data-id]");
    if (!btn) return;

    const plan = plans.find(p => p.id === btn.dataset.id);
    const noSeatsAvailable = plan.seatsFilled >= plan.seatsTotal;

    if (noSeatsAvailable) {
      openManagerModal(plan);
      return;
    }

    setPendingJoin({
      planId: plan.id,
      plan: plan.name,
      logo: plan.logo,
      color: plan.color,
      price: plan.price,
      soloPrice: plan.soloPrice,
      seatsFilled: plan.seatsFilled,
      seatsTotal: plan.seatsTotal,
    });
    window.location.href = "payment.html";
  }

  document.getElementById("newOffersRow").addEventListener("click", handlePlanClick);
  document.getElementById("planGrid").addEventListener("click", handlePlanClick);

  // ---------- Manager offer modal ----------
  function openManagerModal(plan) {
    activePlan = plan;
    document.getElementById("modalPlanName").textContent = plan.name;
    document.getElementById("modalManagerPrice").textContent = fmt(plan.managerPrice);
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

  document.getElementById("acceptManagerOffer").addEventListener("click", () => {
    if (!activePlan) return;
    console.log(`Manager offer accepted for ${activePlan.name} (front-end only).`);
    window.location.href = `manager-agreement.html?plan=${activePlan.id}`;
  });

  document.getElementById("declineManagerOffer").addEventListener("click", () => {
    if (!activePlan) return;
    console.log(`Added to waitlist for ${activePlan.name} (front-end only).`);
    closeManagerModal();
    window.location.href = "dashboard.html#waitlist";
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

  // ---------- Initial render ----------
  renderAll();
});

// ---------------------------------------------------------------------------
// HOW TO SWAP IN YOUR OWN LOGO FILES INSTEAD OF THE SIMPLE ICONS CDN:
// 1. Download the official logo/asset from each brand's press/brand page.
// 2. Save each file into your images/ folder, e.g. images/spotify-logo.svg
// 3. In the `plans` array above, change:
//      logo: "https://cdn.simpleicons.org/spotify/1DB954"
//    to:
//      logo: "../images/spotify-logo.svg"
// 4. No other code changes needed — every card (`Top plans`, `All plans`)
//    reads from the same `plan.logo` field.
// ---------------------------------------------------------------------------