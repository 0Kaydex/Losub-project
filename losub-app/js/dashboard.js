document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  // Fallback logos for plans that don't have one set in the database yet
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

  let notifications = [];

  function timeAgo(isoString) {
    const diffMs = Date.now() - new Date(isoString + "Z").getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const roleLabel = { member: "Member", manager: "Manager" };
  const statusLabel = { paid: "Paid", pending: "Pending", defaulted: "Defaulted" };
  const fmt = n => `₦${n.toLocaleString()}`;

  let groups = [];
  let walletBalance = 0;

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
            <span class="group-card__role group-card__role--${g.role}">${roleLabel[g.role] || g.role}</span>
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

    if (!notifications.length) {
      list.innerHTML = `<li class="dash__empty-inline">No notifications yet.</li>`;
      updateBell();
      return;
    }

    list.innerHTML = notifications.slice(0, 4).map(n => `
      <li class="notif-item ${n.read ? 'is-read' : ''}" data-id="${n.id}">
        <span class="notif-item__dot"></span>
        <div class="notif-item__body">
          <p>${n.link ? `<a href="${n.link}" target="_blank" rel="noopener">${n.text}</a>` : n.text}</p>
          <span class="notif-item__time">${timeAgo(n.created_at)}</span>
        </div>
      </li>
    `).join("");
    updateBell();
  }

  // ---------- Waitlist — no backend table for this yet, so honest empty state ----------
  function renderWaitlist() {
    const list = document.getElementById("waitlistList");
    const empty = document.getElementById("waitlistEmpty");
    list.hidden = true;
    empty.hidden = false;
  }

  function updateBell() {
    const hasUnread = notifications.some(n => !n.read);
    const bellDot = document.getElementById("bellDot");
    if (bellDot) bellDot.hidden = !hasUnread;
  }

  document.getElementById("markAllRead").addEventListener("click", async () => {
    const previous = notifications.map(n => ({ ...n }));
    notifications.forEach(n => n.read = true);
    renderNotifications();
    renderStats();
    try {
      const res = await fetch(`${API_ORIGIN}/api/notifications/read-all`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      notifications = previous;
      renderNotifications();
      renderStats();
    }
  });

  function renderWalletBalance() {
    document.getElementById("dashWalletBalance").textContent = fmt(walletBalance);
  }

  // ---------- Real data loads ----------
  async function loadGroups() {
    try {
      const res = await fetch(`${API_ORIGIN}/api/groups/mine`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      const data = await res.json();
      groups = data.groups || [];
    } catch {
      groups = [];
    }
    renderStats();
    renderGroups();
  }

  async function loadWallet() {
    try {
      const res = await fetch(`${API_ORIGIN}/api/wallet`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      walletBalance = data.balance || 0;
    } catch {
      walletBalance = 0;
    }
    renderWalletBalance();
  }

  async function loadNotifications() {
    try {
      const res = await fetch(`${API_ORIGIN}/api/notifications`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      const data = await res.json();
      notifications = (data.notifications || []).map(n => ({ ...n, read: !!n.read }));
    } catch {
      notifications = [];
    }
    renderNotifications();
    renderStats();
  }

  // ---------- Initial render ----------
  loadGroups();
  loadWallet();
  loadNotifications();
  renderWaitlist();

  // ---------- Greeting name ----------
  const storedUser = localStorage.getItem("losub_user");
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      const nameEl = document.getElementById("userName");
      if (nameEl) nameEl.textContent = user.fullname?.split(" ")[0] || "there";
    } catch {}
  }
});