document.addEventListener("DOMContentLoaded", () => {

  // Fallback logos for demo groups that predate the logo field (e.g. seeded data below)
  const LOGO_MAP = {
    Netflix: "https://cdn.simpleicons.org/netflix/E50914",
    Spotify: "https://cdn.simpleicons.org/spotify/1DB954",
    Capcut: "https://cdn.simpleicons.org/capcut/000000",
    youtube: "https://cdn.simpleicons.org/youtube/FF0000",
    "Amazon Music": "https://cdn.simpleicons.org/amazonmusic/4A9EE0",
    "Microsoft 365": "https://cdn.simpleicons.org/microsoft365/D83B01",
    "Prime Video": "https://cdn.simpleicons.org/primevideo/00A8E1",
    "Disney+": "https://cdn.simpleicons.org/disneyplus/113CCF",
    Canva: "https://cdn.simpleicons.org/canva/00C4CC",
    Duolingo: "https://cdn.simpleicons.org/duolingo/58CC02",
  };

  function logoFor(g) {
    return g.logo || LOGO_MAP[g.plan] || "https://cdn.simpleicons.org/googleplay/34A853";
  }

  // First-time visitors get two example groups so the dashboard isn't empty.
  // Real accounts would just start with nothing here.
  seedGroupsIfEmpty([
    { id: "g1", plan: "Netflix", color: "#E50914", role: "member", seatsFilled: 3, seatsTotal: 4, paymentStatus: "paid", yourPrice: 1500, soloPrice: 5200, manager: "Tunde A.", nextPaymentDate: "Aug 12, 2026" },
    { id: "g2", plan: "Spotify", color: "#1DB954", role: "manager", seatsFilled: 5, seatsTotal: 6, paymentStatus: "pending", yourPrice: 800, soloPrice: 3200, manager: "Ngozi E.", nextPaymentDate: "Aug 3, 2026" },
  ]);

  const groups = getMyGroups();

  const notifications = [
    { id: "n1", text: "Your Netflix payment was received.", time: "2h ago", read: false },
    { id: "n2", text: "A seat opened in Capcut — you're next on the waitlist.", time: "1d ago", read: false },
    { id: "n3", text: "Your Spotify group manager sent a reminder about seat renewal.", time: "3d ago", read: true },
  ];

  const waitlist = [
    { plan: "Capcut", position: 1 },
    { plan: "Prime Video", position: 4 },
  ];

  const roleLabel = { member: "Member", manager: "Manager" };
  const statusLabel = { paid: "Paid", pending: "Pending", defaulted: "Defaulted" };
  const fmt = n => `₦${n.toLocaleString()}`;

  // ---------- Stats row ----------
  function renderStats() {
    document.getElementById("statActivePlans").textContent = groups.length;

    const totalSaved = groups.reduce((sum, g) => sum + ((g.soloPrice || 0) - (g.yourPrice || 0)), 0);
    document.getElementById("statTotalSaved").textContent = fmt(totalSaved);

    const upcoming = groups
      .filter(g => g.nextPaymentDate)
      .sort((a, b) => new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate))[0];
    document.getElementById("statNextPayment").textContent = upcoming ? upcoming.nextPaymentDate : "—";

    const unreadCount = notifications.filter(n => !n.read).length;
    document.getElementById("statUnread").textContent = unreadCount;
  }

  // ---------- Groups grid ----------
  function renderGroups() {
    const grid = document.getElementById("groupGrid");
    const empty = document.getElementById("groupsEmpty");

    if (!groups.length) {
      grid.hidden = true;
      empty.hidden = false;
      return;
    }
    grid.hidden = false;
    empty.hidden = true;

    grid.innerHTML = groups.map(g => {
      const percent = Math.round((g.seatsFilled / g.seatsTotal) * 100);
      return `
        <article class="group-card">
          <div class="group-card__top">
            <div class="group-card__plan">
              <img src="${logoFor(g)}" alt="${g.plan}" class="group-card__logo" style="background:${(g.color || '#111827')}1A;" />
              <h3>${g.plan}</h3>
            </div>
            <span class="group-card__role group-card__role--${g.role}">${roleLabel[g.role]}</span>
          </div>

          <div>
            <div class="group-card__progress-meta">
              <span>${g.seatsFilled}/${g.seatsTotal} seats filled</span>
            </div>
            <div class="group-card__progress-bar">
              <div class="group-card__progress-fill" style="width:${percent}%;"></div>
            </div>
          </div>

          <div class="group-card__meta">
            <span>Your payment</span>
            <span class="status-pill status-pill--${g.paymentStatus}">${statusLabel[g.paymentStatus] || "—"}</span>
          </div>

          <a href="${g.role === 'manager' ? 'manage-group.html' : 'group.html'}?id=${g.id}" class="group-card__cta">
            ${g.role === 'manager' ? 'Manage group' : 'View group'}
          </a>
        </article>
      `;
    }).join("");
  }

  // ---------- Notifications ----------
  function renderNotifications() {
    const list = document.getElementById("notifList");
    list.innerHTML = notifications.slice(0, 4).map(n => `
      <li class="notif-item ${n.read ? 'is-read' : ''}" data-id="${n.id}">
        <span class="notif-item__dot"></span>
        <div class="notif-item__body">
          <p>${n.text}</p>
          <span class="notif-item__time">${n.time}</span>
        </div>
      </li>
    `).join("");
    updateBell();
  }

  // ---------- Waitlist ----------
  function renderWaitlist() {
    const list = document.getElementById("waitlistList");
    const empty = document.getElementById("waitlistEmpty");

    if (!waitlist.length) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }
    list.hidden = false;
    empty.hidden = true;

    list.innerHTML = waitlist.map(w => `
      <li class="waitlist-item">
        <span class="waitlist-item__plan">${w.plan}</span>
        <span class="waitlist-item__pos">Position ${w.position}</span>
      </li>
    `).join("");
  }

  // ---------- Notification bell (lives in the topbar now) ----------
  function updateBell() {
    const hasUnread = notifications.some(n => !n.read);
    const bellDot = document.getElementById("bellDot");
    if (bellDot) bellDot.hidden = !hasUnread;
  }

  document.getElementById("markAllRead").addEventListener("click", () => {
    notifications.forEach(n => n.read = true);
    renderNotifications();
    renderStats();
    // TODO: call backend to persist read state
  });

  // ---------- Initial render ----------
  renderStats();
  renderGroups();
  renderNotifications();
  renderWaitlist();

  // ---------- Greeting name (app-shell.js also fills the sidebar name/initial separately) ----------
  const storedUser = localStorage.getItem("losub_user");
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      const nameEl = document.getElementById("userName");
      if (nameEl) nameEl.textContent = user.fullname?.split(" ")[0] || "there";
    } catch {}
  }
});