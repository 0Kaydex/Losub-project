document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const planId = params.get("plan");
  const plan = availablePlans.find(p => p.id === planId) || availablePlans[0];

  renderHero(plan);
  renderManager(plan);
  wireJoinLogic(plan);
});

function renderHero(plan) {
  const seatsOpen = plan.seatsFilled < plan.seatsTotal;
  document.getElementById("plan-hero").innerHTML = `
    <div class="plan-hero__top">
      <div>
        <div class="plan-hero__name">${plan.name}</div>
        <div class="plan-hero__category">${plan.category}</div>
      </div>
      <div class="plan-hero__price">₦${plan.pricePerSeat}<span>/month per seat</span></div>
    </div>

    <div class="plan-hero__seats">${plan.seatsFilled}/${plan.seatsTotal} seats filled</div>
    <div class="plan-hero__bar">
      <div class="plan-hero__bar-fill" style="width:${(plan.seatsFilled / plan.seatsTotal) * 100}%"></div>
    </div>

    <button class="plan-hero__cta" id="join-btn">${seatsOpen ? "Join this plan" : "Plan is full"}</button>
  `;
}

function renderManager(plan) {
  document.getElementById("plan-manager").innerHTML = `
    <h4>Current Manager</h4>
    <div class="plan-manager__row">
      <span>${plan.manager.name}</span>
      <span>★ ${plan.manager.rating}</span>
    </div>
  `;
}

function wireJoinLogic(plan) {
  const joinBtn = document.getElementById("join-btn");
  const modal = document.getElementById("full-modal");
  const modalFee = document.getElementById("modal-fee");
  const toast = document.getElementById("waitlist-toast");

  const seatsOpen = plan.seatsFilled < plan.seatsTotal;

  joinBtn.addEventListener("click", () => {
    if (seatsOpen) {
      // Front-end only for now: simulate payment + join
      const confirmed = confirm(`Pay ₦${plan.pricePerSeat} to join ${plan.name}? (This goes to Losub, not the manager.)`);
      if (confirmed) {
        window.location.href = `my-group.html?plan=${plan.id}`;
      }
    } else {
      const discountedFee = Math.round(plan.pricePerSeat * 0.7);
      modalFee.textContent = `Manager fee: ₦${discountedFee}/month (30% less than a seat price)`;
      modal.classList.add("is-open");
    }
  });

  document.getElementById("become-manager-btn").addEventListener("click", () => {
    window.location.href = `manager-agreement.html?plan=${plan.id}`;
  });

  document.getElementById("join-waitlist-btn").addEventListener("click", () => {
    modal.classList.remove("is-open");
    toast.classList.add("is-visible");
    setTimeout(() => toast.classList.remove("is-visible"), 3500);
    // Front-end only: in a real backend this would POST to a waitlist endpoint
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("is-open");
  });
}