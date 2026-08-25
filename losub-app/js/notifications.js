document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  const ICON_MAP = { wallet: "💳", group: "👥", group_link: "🔗", general: "🔔" };
  const LABEL_MAP = { wallet: "Wallet", group: "Group", group_link: "Access link", general: "Losub" };

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

  let notifications = [];
  let currentFilter = "all";

  function render() {
    const list = document.getElementById("fullNotifList");
    const empty = document.getElementById("fullNotifEmpty");

    const visible = currentFilter === "unread"
      ? notifications.filter(n => !n.read)
      : notifications;

    if (!visible.length) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }
    list.hidden = false;
    empty.hidden = true;

    list.innerHTML = visible.map(n => `
      <li class="full-notif-item ${n.read ? 'is-read' : ''}" data-id="${n.id}">
        <span class="full-notif-item__icon">${ICON_MAP[n.type] || ICON_MAP.general}</span>
        <div class="full-notif-item__body">
          <p>${n.link ? `<a href="${n.link}" target="_blank" rel="noopener">${n.text}</a>` : n.text}</p>
          <div class="full-notif-item__meta">
            <span>${LABEL_MAP[n.type] || LABEL_MAP.general}</span>
            <span>·</span>
            <span>${timeAgo(n.created_at)}</span>
          </div>
        </div>
        ${!n.read ? '<span class="full-notif-item__dot-unread"></span>' : ''}
      </li>
    `).join("");
  }

  async function loadNotifications() {
    try {
      const res = await fetch(`${API_ORIGIN}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      const data = await res.json();
      notifications = (data.notifications || []).map(n => ({ ...n, read: !!n.read }));
    } catch {
      notifications = [];
    }
    render();
  }

  document.getElementById("notifTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-bar__btn");
    if (!btn) return;
    document.querySelectorAll("#notifTabs .tab-bar__btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    currentFilter = btn.dataset.filter;
    render();
  });

  document.getElementById("fullNotifList").addEventListener("click", async (e) => {
    const item = e.target.closest(".full-notif-item");
    if (!item) return;
    const n = notifications.find(x => String(x.id) === item.dataset.id);
    if (!n || n.read) return;

    n.read = true;
    render();
    try {
      const res = await fetch(`${API_ORIGIN}/api/notifications/${n.id}/read`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      n.read = false;
      render();
    }
  });

  document.getElementById("markAllReadFull").addEventListener("click", async () => {
    const previous = notifications.map(n => ({ ...n }));
    notifications.forEach(n => n.read = true);
    render();
    try {
      const res = await fetch(`${API_ORIGIN}/api/notifications/read-all`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      notifications = previous;
      render();
    }
  });

  loadNotifications();
});
