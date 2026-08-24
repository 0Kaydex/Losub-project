document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  let allUsers = [];
  let searchTerm = "";
  let currentRole = "all";
  let activeUser = null;

  const roleLabel = { member: "Member", admin: "Admin", owner: "Owner" };
  const statusLabel = { active: "Active", suspended: "Suspended" };
  const statusClass = { active: "paid", suspended: "defaulted" };

  function getFiltered() {
    return allUsers.filter(u => {
      const matchesRole = currentRole === "all" || u.role === currentRole;
      const matchesSearch =
        u.fullname.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase());
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

    body.innerHTML = visible.map(u => {
      const status = u.suspended ? "suspended" : "active";
      const joined = new Date(u.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
      const canSuspend = u.role !== "owner";

      return `
        <tr>
          <td>${u.fullname}</td>
          <td>${u.email}</td>
          <td>${roleLabel[u.role] || u.role}</td>
          <td>${joined}</td>
          <td><span class="status-pill status-pill--${statusClass[status]}">${statusLabel[status]}</span></td>
          <td>
            ${canSuspend
              ? `<button type="button" class="admin-action-btn ${status === 'suspended' ? '' : 'admin-action-btn--danger'}" data-id="${u.id}">
                   ${status === 'suspended' ? 'Reinstate' : 'Suspend'}
                 </button>`
              : `<span class="admin-list__meta">—</span>`}
          </td>
        </tr>
      `;
    }).join("");
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
    activeUser = allUsers.find(u => String(u.id) === btn.dataset.id);
    const isSuspending = !activeUser.suspended;
    document.getElementById("userModalTitle").textContent = isSuspending ? "Suspend user" : "Reinstate user";
    document.getElementById("userModalSub").textContent = isSuspending
      ? `${activeUser.fullname} won't be able to log in until reinstated.`
      : `${activeUser.fullname} will regain full access immediately.`;
    document.getElementById("userModalConfirm").textContent = isSuspending ? "Suspend" : "Reinstate";
    document.getElementById("userModalOverlay").hidden = false;
  });

  function closeModal() { document.getElementById("userModalOverlay").hidden = true; activeUser = null; }
  document.getElementById("userModalClose").addEventListener("click", closeModal);
  document.getElementById("userModalCancel").addEventListener("click", closeModal);

  document.getElementById("userModalConfirm").addEventListener("click", async () => {
    if (!activeUser) return;
    const btn = document.getElementById("userModalConfirm");
    btn.disabled = true;

    try {
      const res = await fetch(`${API_ORIGIN}/api/admin/users/${activeUser.id}/suspend`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Couldn't update that user.");
      } else {
        activeUser.suspended = data.suspended ? 1 : 0;
        render();
      }
    } catch {
      alert("Network error — try again.");
    }

    btn.disabled = false;
    closeModal();
  });

  async function loadUsers() {
    try {
      const res = await fetch(`${API_ORIGIN}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      if (res.status === 403) { window.location.href = "index.html"; return; }

      const data = await res.json();
      allUsers = data.users || [];
      render();
    } catch {
      document.getElementById("usersEmpty").hidden = false;
      document.getElementById("usersEmpty").textContent = "Couldn't load users. Refresh to try again.";
    }
  }

  loadUsers();
});