document.addEventListener("DOMContentLoaded", () => {

  // ---- Mock data — replace with a real fetch ----
  let notifications = [
    { id: "n1", icon: "🎬", group: "Netflix", text: "Your payment was received.", time: "2h ago", read: false },
    { id: "n2", icon: "🎵", group: "Spotify", text: "A seat opened in Capcut — you're next on the waitlist.", time: "1d ago", read: false },
    { id: "n3", icon: "🎵", group: "Spotify", text: "Your Spotify group manager sent a reminder about seat renewal.", time: "3d ago", read: true },
    { id: "n4", icon: "🎬", group: "Netflix", text: "Your payment is due in 3 days.", time: "5d ago", read: true },
  ];
  // ---- End mock data ----

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
        <span class="full-notif-item__icon">${n.icon}</span>
        <div class="full-notif-item__body">
          <p>${n.text}</p>
          <div class="full-notif-item__meta">
            <span>${n.group}</span>
            <span>·</span>
            <span>${n.time}</span>
          </div>
        </div>
        ${!n.read ? '<span class="full-notif-item__dot-unread"></span>' : ''}
      </li>
    `).join("");
  }

  document.getElementById("notifTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-bar__btn");
    if (!btn) return;
    document.querySelectorAll("#notifTabs .tab-bar__btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    currentFilter = btn.dataset.filter;
    render();
  });

  document.getElementById("fullNotifList").addEventListener("click", (e) => {
    const item = e.target.closest(".full-notif-item");
    if (!item) return;
    const n = notifications.find(x => x.id === item.dataset.id);
    if (n) n.read = true;
    // TODO: call backend to persist read state
    render();
  });

  document.getElementById("markAllReadFull").addEventListener("click", () => {
    notifications.forEach(n => n.read = true);
    // TODO: call backend to persist read state
    render();
  });

  render();
});