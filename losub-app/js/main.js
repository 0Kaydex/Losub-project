// ===========================================================
// Losub — main.js
// Small, dependency-free interactions for the landing page.
// ===========================================================

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initFaq();
  initTestimonials();
  initHeroRotator();
});

/* --- Mobile menu toggle --- */
function initMobileMenu() {
  const burger = document.querySelector('.navbar__burger');
  const menu = document.querySelector('.navbar__mobile-menu');
  if (!burger || !menu) return;

  burger.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(isOpen));
  });

  // close the menu whenever a link inside it is used
  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menu.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    });
  });
}

/* --- Hero headline: rotating subscription name --- */
function initHeroRotator() {
  const el = document.getElementById('heroRotator');
  if (!el) return;

  // Add or remove words here — this is the only line you need to touch.
  const words = ['Netflix', 'Spotify', 'YouTube', 'Amazon Prime', 'Capcut', 'Claude Ai'];

  if (el.dataset.rotatorBound === 'true') return; // stop duplicate timers
  el.dataset.rotatorBound = 'true';

  let index = 0;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  setInterval(() => {
    if (!prefersReducedMotion) el.classList.add('is-swapping');

    setTimeout(() => {
      index = (index + 1) % words.length;
      el.textContent = words[index];
      el.classList.remove('is-swapping');
    }, prefersReducedMotion ? 0 : 100);
  }, 1200);
}
/* --- FAQ accordion --- */
function initFaq() {
  const items = document.querySelectorAll('.faq-item');

  items.forEach((item) => {
    const question = item.querySelector('.faq-item__question');
    question.addEventListener('click', () => {
      const alreadyOpen = item.classList.contains('is-open');

      items.forEach((other) => {
        other.classList.remove('is-open');
        other.querySelector('.faq-item__question').setAttribute('aria-expanded', 'false');
      });

      if (!alreadyOpen) {
        item.classList.add('is-open');
        question.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

function initTestimonials() {
  const testimonialsData = [
    { name: "Chidinma A.", quote: "Losub made sharing my Spotify family plan effortless. Payments are always on time." },
    { name: "Emeka O.",   quote: "I saved over 60% on Netflix by splitting it with verified co-subscribers. Super smooth." },
    { name: "Amara N.",   quote: "Support responded fast when a co-subscriber dropped off. Really solid platform." },
    { name: "Tunde K.",   quote: "Been using Losub for 6 months now, never had a payment issue with any group." },
  ];

  const stage = document.querySelector(".testimonials__stage");
  const dotsWrap = document.querySelector(".testimonials__dots");
  const prevBtn = document.querySelector(".testimonials__arrow--prev");
  const nextBtn = document.querySelector(".testimonials__arrow--next");
  const carousel = document.querySelector(".testimonials__carousel");

  if (!stage || !dotsWrap || !prevBtn || !nextBtn || !carousel) {
    console.warn("Testimonials: one or more elements not found in DOM.");
    return;
  }

  let current = 0;
  let autoplayTimer;

  function renderStage() {
    stage.innerHTML = "";
    testimonialsData.forEach((t, i) => {
      let offset = (i - current + testimonialsData.length) % testimonialsData.length;
      let pos = offset <= 2 ? String(offset) : "hidden";

      const card = document.createElement("blockquote");
      card.className = "testimonials__card";
      card.dataset.pos = pos;
      card.innerHTML = `
        <div class="testimonials__stars" aria-hidden="true">★★★★★</div>
        <p class="testimonials__name">${t.name}</p>
        <p class="testimonials__quote">${t.quote}</p>
      `;
      stage.appendChild(card);
    });
  }

  function renderDots() {
    dotsWrap.innerHTML = "";
    testimonialsData.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.className = "dot" + (i === current ? " dot--active" : "");
      dot.addEventListener("click", () => goTo(i));
      dotsWrap.appendChild(dot);
    });
  }

  function goTo(index) {
    current = (index + testimonialsData.length) % testimonialsData.length;
    renderStage();
    renderDots();
    resetAutoplay();
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function resetAutoplay() {
    clearInterval(autoplayTimer);
    autoplayTimer = setInterval(next, 4000);
  }

  prevBtn.addEventListener("click", prev);
  nextBtn.addEventListener("click", next);

  carousel.addEventListener("mouseenter", () => clearInterval(autoplayTimer));
  carousel.addEventListener("mouseleave", resetAutoplay);

  renderStage();
  renderDots();
  resetAutoplay();
}

document.addEventListener("DOMContentLoaded", initTestimonials);