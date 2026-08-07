document.addEventListener("DOMContentLoaded", () => {

  // TODO: replace with GET /api/admin/audit-log
  const logEntries = [
    { time: "Aug 5, 2026 · 2:14 PM", admin: "Adaeze O.", type: "verification", action: "Approved partner offer", target: "Ngozi E. (Spotify)" },
    { time: "Aug 5, 2026 · 11:02 AM", admin: "Adaeze O.", type: "user", action: "Suspended account", target: "Samuel T." },
    { time: "Aug 4, 2026 · 6:40 PM", admin: "Kola B.", type: "reassignment", action: "Reassigned group", target: "Capcut → David O." },
    { time: "Aug 4, 2026 · 3:15 PM", admin: "Adaeze O.", type: "verification", action: "Rejected submission", target: "Yusuf B. (Duolingo)" },
    { time: "Aug 3, 2026 · 9:30 AM", admin: "Kola B.", type: "user", action: "Reinstated account", target: "Blessing U." },
  ];

  let currentType = "all";

  function render() {
    const body = document.getElementById("auditTableBody");
    const empty = document.getElementById("auditEmpty");
    const visible = currentType === "all" ? logEntries : logEntries.filter(e => e.type === currentType);

    if (!visible.length) {
      body.closest("table").hidden = true;
      empty.hidden = false;
      return;
    }
    body.closest("table").hidden = false;
    empty.hidden = true;

    body.innerHTML = visible.map(e => `
      <tr>
        <td>${e.time}</td>
        <td>${e.admin}</td>
        <td>${e.action}</td>
        <td>${e.target}</td>
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

  render();
});