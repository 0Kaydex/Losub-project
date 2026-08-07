document.addEventListener("DOMContentLoaded", () => {

  // ---- Mock platform-wide data — replace with real admin API calls ----
  const stats = { totalUsers: 1284, activeGroups: 96, flaggedManagers: 3, pendingVerifications: 5 };

  const flaggedManagers = [
    { name: "Tunde A.", plan: "Netflix", reason: "No login in 9 days" },
    { name: "Samuel T.", plan: "Microsoft 365", reason: "Missed check-in deadline" },
    { name: "Blessing U.", plan: "Amazon Music", reason: "Seat not filled in 6 days" },
  ];

  const recentGroups = [
    { plan: "Spotify", manager: "Ngozi E.", seats: "5/6", status: "active" },
    { plan: "Netflix", manager: "Tunde A.", seats: "3/4", status: "flagged" },
    { plan: "Capcut", manager: "David O.", seats: "1/2", status: "active" },
    { plan: "Disney+", manager: "Femi A.", seats: "3/6", status: "active" },
  ];

  const pendingVerifications = [
    { name: "David O.", plan: "Capcut", submitted: "2h ago" },
    { name: "Femi A.", plan: "Disney+", submitted: "1d ago" },
    { name: "Yusuf B.", plan: "Duolingo", submitted: "2d ago" },
  ];

  const recentActions = [
    { text: "Approved partner offer for Ngozi E. (Spotify)", time: "3h ago" },
    { text: "Sent check-in message to Tunde A. (Netflix)", time: "1d ago" },
    { text: "Reassigned Capcut group to David O.", time: "2d ago" },
  ];
  // ---- End mock data ----

  function renderStats() {
    document.getElementById("statTotalUsers").textContent = stats.totalUsers.toLocaleString();
    document.getElementById("statActiveGroups").textContent = stats.activeGroups;
    document.getElementById("statFlaggedManagers").textContent = stats.flaggedManagers;
    document.getElementById("statPendingVerifications").textContent = stats.pendingVerifications;
  }

  function renderFlaggedManagers() {
    document.getElementById("flaggedManagersList").innerHTML = flaggedManagers.map(m => `
      <li>
        <div>
          <div class="admin-list__name">${m.name} · ${m.plan}</div>
          <div class="admin-list__meta">${m.reason}</div>
        </div>
        <span class="admin-flag-pill">Flagged</span>
      </li>
    `).join("");
  }

  function renderRecentGroups() {
    const statusLabel = { active: "Active", flagged: "Flagged" };
    document.getElementById("recentGroupsBody").innerHTML = recentGroups.map(g => `
      <tr>
        <td>${g.plan}</td>
        <td>${g.manager}</td>
        <td>${g.seats}</td>
        <td><span class="status-pill status-pill--${g.status === 'flagged' ? 'defaulted' : 'paid'}">${statusLabel[g.status]}</span></td>
      </tr>
    `).join("");
  }

  function renderPendingVerifications() {
    document.getElementById("pendingVerificationsList").innerHTML = pendingVerifications.map(v => `
      <li>
        <div>
          <div class="admin-list__name">${v.name} · ${v.plan}</div>
          <div class="admin-list__meta">Submitted ${v.submitted}</div>
        </div>
      </li>
    `).join("");
  }

  function renderRecentActions() {
    document.getElementById("recentActionsList").innerHTML = recentActions.map(a => `
      <li>
        <div>
          <div class="admin-list__name">${a.text}</div>
          <div class="admin-list__meta">${a.time}</div>
        </div>
      </li>
    `).join("");
  }

  document.getElementById("adminLogout").addEventListener("click", (e) => {
    e.preventDefault();
    // TODO: call backend to invalidate admin session
    window.location.href = "auth.html";
  });

  renderStats();
  renderFlaggedManagers();
  renderRecentGroups();
  renderPendingVerifications();
  renderRecentActions();
});