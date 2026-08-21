document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  const comingSoon = (label) => `<li class="admin-list__meta">${label} isn't built yet — coming in a future update.</li>`;

  function renderNotBuiltYet() {
    document.getElementById("statFlaggedManagers").textContent = "—";
    document.getElementById("statPendingVerifications").textContent = "—";
    document.getElementById("flaggedManagersList").innerHTML = comingSoon("Manager flagging");
    document.getElementById("pendingVerificationsList").innerHTML = comingSoon("Verification review");
    document.getElementById("recentActionsList").innerHTML = comingSoon("Audit log");
  }

  async function loadStats() {
    try {
      const res = await fetch(`${API_ORIGIN}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      if (res.status === 403) { window.location.href = "index.html"; return; }

      const data = await res.json();
      document.getElementById("statTotalUsers").textContent = (data.totalUsers ?? 0).toLocaleString();
      document.getElementById("statActiveGroups").textContent = data.activeGroups ?? 0;
    } catch {
      document.getElementById("statTotalUsers").textContent = "—";
      document.getElementById("statActiveGroups").textContent = "—";
    }
  }

  async function loadRecentGroups() {
    const statusLabel = { active: "Active", full: "Full" };
    const statusClass = { active: "paid", full: "full" };

    try {
      const res = await fetch(`${API_ORIGIN}/api/admin/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) return;

      const data = await res.json();
      const recent = (data.groups || []).slice(0, 5);
      const body = document.getElementById("recentGroupsBody");

      body.innerHTML = recent.length
        ? recent.map(g => `
            <tr>
              <td>${g.plan}</td>
              <td>${g.manager}</td>
              <td>${g.seatsFilled}/${g.seatsTotal}</td>
              <td><span class="status-pill status-pill--${statusClass[g.status] || 'paid'}">${statusLabel[g.status] || g.status}</span></td>
            </tr>
          `).join("")
        : `<tr><td colspan="4" class="admin-list__meta">No groups yet.</td></tr>`;
    } catch {
      document.getElementById("recentGroupsBody").innerHTML =
        `<tr><td colspan="4" class="admin-list__meta">Couldn't load groups.</td></tr>`;
    }
  }

  loadStats();
  loadRecentGroups();
  renderNotBuiltYet();
});
