document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  const ACTION_LABEL = {
    "user.suspend": "Suspended account",
    "user.reinstate": "Reinstated account",
    "user.role_change": "Changed user role",
    "plan.create": "Added plan",
    "plan.delete": "Deleted plan",
  };

  let logEntries = [];
  let currentType = "all";

  function formatTime(isoString) {
    // created_at is stored as UTC "YYYY-MM-DD HH:MM:SS" (SQLite datetime('now'))
    const d = new Date(isoString.replace(" ", "T") + "Z");
    return d.toLocaleString("en-NG", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function render() {
    const body = document.getElementById("auditTableBody");
    const empty = document.getElementById("auditEmpty");
    const visible = currentType === "all" ? logEntries : logEntries.filter(e => e.targetType === currentType);

    if (!visible.length) {
      body.closest("table").hidden = true;
      empty.hidden = false;
      return;
    }
    body.closest("table").hidden = false;
    empty.hidden = true;

    body.innerHTML = visible.map(e => `
      <tr>
        <td>${formatTime(e.date)}</td>
        <td>${e.actor}</td>
        <td>${ACTION_LABEL[e.action] || e.action}</td>
        <td>${e.details || "—"}</td>
      </tr>
    `).join("");
  }

  document.getElementById("auditTypeTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-bar__btn");
    if (!btn) return;
    document.querySelectorAll("#auditTypeTabs .tab-bar__btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    currentType = btn.dataset.type;
    render();
  });

  async function loadAuditLog() {
    try {
      const res = await fetch(`${API_ORIGIN}/api/admin/audit-log`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      if (res.status === 403) { window.location.href = "index.html"; return; }
      if (!res.ok) throw new Error("Request failed");

      const data = await res.json();
      logEntries = data.entries || [];
      render();
    } catch {
      document.getElementById("auditEmpty").hidden = false;
      document.getElementById("auditEmpty").textContent = "Couldn't load the audit log. Refresh to try again.";
      document.getElementById("auditTableBody").closest("table").hidden = true;
    }
  }

  loadAuditLog();
});
