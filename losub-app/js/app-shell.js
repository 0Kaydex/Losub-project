document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("shellBackdrop");
  const collapseBtn = document.getElementById("sidebarCollapseBtn");
  const menuBtn = document.getElementById("topbarMenuBtn");

  // ---------- Desktop collapse (persisted) ----------
  if (localStorage.getItem("losub_sidebar_collapsed") === "true") {
    sidebar.classList.add("is-collapsed");
  }

  collapseBtn?.addEventListener("click", () => {
    const isCollapsed = sidebar.classList.toggle("is-collapsed");
    localStorage.setItem("losub_sidebar_collapsed", isCollapsed);
  });

  // ---------- Mobile open/close ----------
  function openMobileSidebar() {
    sidebar.classList.add("is-mobile-open");
    backdrop.classList.add("is-visible");
  }
  function closeMobileSidebar() {
    sidebar.classList.remove("is-mobile-open");
    backdrop.classList.remove("is-visible");
  }

  menuBtn?.addEventListener("click", openMobileSidebar);
  backdrop?.addEventListener("click", closeMobileSidebar);

  // ---------- Highlight active nav link based on current page ----------
  const currentPage = window.location.pathname.split("/").pop().replace(".html", "") || "dashboard";
  document.querySelectorAll(".sidebar__link, .sidebar__user").forEach(link => {
    if (link.dataset.page === currentPage) link.classList.add("is-active");
  });

  // ---------- Populate user avatar/name from session ----------
  const storedUser = localStorage.getItem("losub_user");
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      const firstName = user.fullname?.split(" ")[0] || "Account";
      const initial = (user.fullname?.charAt(0) || "?").toUpperCase();
      document.querySelectorAll("[data-user-name]").forEach(el => el.textContent = firstName);
      document.querySelectorAll("[data-user-initial]").forEach(el => el.textContent = initial);
    } catch {}
  }
});