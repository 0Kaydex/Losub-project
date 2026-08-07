document.addEventListener("DOMContentLoaded", () => {

  // TODO: replace with GET /api/admin/users
  const users = [
    { id: "u1", name: "Chidinma Adaeze", email: "chidinma@example.com", roles: ["member"], joined: "Jun 2, 2026", status: "active" },
    { id: "u2", name: "Ngozi E.", email: "ngozi@example.com", roles: ["manager"], joined: "May 14, 2026", status: "active" },
    { id: "u3", name: "Tunde A.", email: "tunde@example.com", roles: ["manager"], joined: "Apr 30, 2026", status: "flagged" },
    { id: "u4", name: "Ifeoma K.", email: "ifeoma@example.com", roles: ["member"], joined: "Jul 1, 2026", status: "active" },
    { id: "u5", name: "David O.", email: "david@example.com", roles: ["member", "manager"], joined: "Mar 18, 2026", status: "active" },
    { id: "u6", name: "Samuel T.", email: "samuel@example.com", roles: ["manager"], joined: "Feb 9, 2026", status: "suspended" },
  ];

  let searchTerm = "";
  let currentRole = "all";
  let activeUser = null;

  const roleLabel = { member: "Member", manager: "Manager" };
  const statusLabel = { active: "Active", flagged: "Flagged", suspended: "Suspended" };
  const statusClass = { active: "paid", flagged: "defaulted", suspended: "defaulted" };

  function getFiltered() {
    return users.filter(u => {
      const matchesRole = currentRole === "all" || u.roles.includes(currentRole);
      const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesRole && matchesSearch;
    });
  }

  function render() {
    const body = document.getElementById("usersTableBody");
    const empty = document.getElementById("usersEmpty");
    const visible = getFiltered();

    if (!visible.length) {
      body.closest("table").hidden = true;
      empty.hidden = false;
      return;
    }
    body.closest("table").hidden = false;
    empty.hidden = true;

    body.innerHTML = visible.map(u => `
      <tr>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${u.roles.map(r => roleLabel[r]).join(" + ")}</td>
        <td>${u.joined}</td>
        <td><span class="status-pill status-pill--${statusClass[u.status]}">${statusLabel[u.status]}</span></td>
        <td>
          <button type="button" class="admin-action-btn ${u.status === 'suspended' ? '' : 'admin-action-btn--danger'}" data-id="${u.id}">
            ${u.status === 'suspended' ? 'Reinstate' : 'Suspend'}
          </button>
        </td>
      </tr>
    `).join("");
  }

  document.getElementById("userSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    render();
  });

  document.getElementById("userRoleTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-bar__btn");
    if (!btn) return;
    document.querySelectorAll("#userRoleTabs .tab-bar__btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    currentRole = btn.dataset.role;
    render();
  });

  document.getElementById("usersTableBody").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (!btn) return;
    activeUser = users.find(u => u.id === btn.dataset.id);
    const isSuspending = activeUser.status !== "suspended";
    document.getElementById("userModalTitle").textContent = isSuspending ? "Suspend user" : "Reinstate user";
    document.getElementById("userModalSub").textContent = isSuspending
      ? `${activeUser.name} won't be able to log in until reinstated.`
      : `${activeUser.name} will regain full access immediately.`;
    document.getElementById("userModalConfirm").textContent = isSuspending ? "Suspend" : "Reinstate";
    document.getElementById("userModalOverlay").hidden = false;
  });

  function closeModal() { document.getElementById("userModalOverlay").hidden = true; activeUser = null; }
  document.getElementById("userModalClose").addEventListener("click", closeModal);
  document.getElementById("userModalCancel").addEventListener("click", closeModal);

  document.getElementById("userModalConfirm").addEventListener("click", () => {
    if (!activeUser) return;
    activeUser.status = activeUser.status === "suspended" ? "active" : "suspended";
    // TODO: call POST /api/admin/users/:id/suspend (or /reinstate)
    // TODO: log this action to the audit log
    closeModal();
    render();
  });

  render();
});