document.addEventListener("DOMContentLoaded", async () => {

  // Adjust this if your backend lives at a different base URL.
  const API_BASE = "https://api.losubapp.com/api";

  const user = JSON.parse(localStorage.getItem("losub_user"));
  const token = localStorage.getItem("losub_token");

  // Owner-only page — anyone else gets bounced immediately.
  if (!user || !token) {
    window.location.href = "auth.html";
    return;
  }
  if (user.role !== "owner") {
    window.location.href = "index.html";
    return;
  }

  const loadingEl = document.getElementById("ownerUsersLoading");
  const errorEl = document.getElementById("ownerUsersError");
  const panelEl = document.getElementById("ownerUsersPanel");
  const bodyEl = document.getElementById("ownerUsersBody");
  const emptyEl = document.getElementById("ownerUsersEmpty");
  const searchInput = document.getElementById("userSearchInput");

  const overlay = document.getElementById("roleConfirmOverlay");
  const confirmText = document.getElementById("roleConfirmText");
  const confirmYes = document.getElementById("roleConfirmYes");
  const confirmNo = document.getElementById("roleConfirmNo");
  const confirmClose = document.getElementById("roleConfirmClose");

  let allUsers = [];
  let pendingChange = null; // { id, email, newRole }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function roleLabel(role) {
    return role === "owner" ? "👑 Owner" : role === "admin" ? "🛡️ Admin" : "Member";
  }

  function renderUsers(list) {
    if (list.length === 0) {
      bodyEl.innerHTML = "";
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    bodyEl.innerHTML = list.map(u => `
      <tr>
        <td>${escapeHtml(u.fullname)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${u.auth_provider === "google" ? "Google" : "Email"}</td>
        <td>${u.email_verified ? "✅" : "—"}</td>
        <td><span class="role-chip role-chip--${u.role}">${roleLabel(u.role)}</span></td>
        <td class="owner-users__actions">
          <select class="owner-role-select" data-id="${u.id}" data-email="${escapeHtml(u.email)}" data-current="${u.role}">
            <option value="member" ${u.role === "member" ? "selected" : ""}>Member</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
            <option value="owner" ${u.role === "owner" ? "selected" : ""}>Owner</option>
          </select>
        </td>
      </tr>
    `).join("");

    bodyEl.querySelectorAll(".owner-role-select").forEach(select => {
      select.addEventListener("change", (e) => {
        const id = e.target.dataset.id;
        const email = e.target.dataset.email;
        const current = e.target.dataset.current;
        const newRole = e.target.value;

        if (newRole === current) return;

        pendingChange = { id, email, newRole, selectEl: e.target, previousRole: current };

        const selfWarning = String(id) === String(user.id)
          ? " This is your own account — you may lose owner access immediately."
          : "";
        confirmText.textContent = `Change ${email} from ${current} to ${newRole}?${selfWarning}`;
        overlay.hidden = false;
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function closeModal() {
    overlay.hidden = true;
    // If cancelled, revert the dropdown to its previous value.
    if (pendingChange) {
      pendingChange.selectEl.value = pendingChange.previousRole;
    }
    pendingChange = null;
  }

  confirmNo.addEventListener("click", closeModal);
  confirmClose.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  confirmYes.addEventListener("click", async () => {
    if (!pendingChange) return;
    const { id, newRole, selectEl } = pendingChange;
    overlay.hidden = true;

    try {
      const res = await fetch(`${API_BASE}/owner/users/${id}/role`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.status === 401) {
        window.location.href = "auth.html";
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        showError(data.error || "Couldn't update that user's role.");
        selectEl.value = pendingChange.previousRole;
        pendingChange = null;
        return;
      }

      // Update local cache and re-render so the chip + dropdown stay in sync.
      const target = allUsers.find(u => String(u.id) === String(id));
      if (target) target.role = newRole;
      renderUsers(filterUsers(searchInput.value));

      // If the owner just changed their own role away from owner, log them out.
      if (String(id) === String(user.id) && newRole !== "owner") {
        localStorage.removeItem("losub_user");
        localStorage.removeItem("losub_token");
        localStorage.removeItem("losub_my_groups");
        window.location.href = "auth.html";
      }
    } catch (err) {
      showError("Network error — couldn't reach the server. Try again.");
    }

    pendingChange = null;
  });

  function filterUsers(query) {
    const q = query.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter(u =>
      u.fullname.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }

  searchInput.addEventListener("input", () => {
    renderUsers(filterUsers(searchInput.value));
  });

  // ---------- Initial load ----------
  try {
    const res = await fetch(`${API_BASE}/owner/users`, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (res.status === 401) {
      window.location.href = "auth.html";
      return;
    }
    if (res.status === 403) {
      window.location.href = "index.html";
      return;
    }
    if (!res.ok) {
      throw new Error("Request failed");
    }

    const data = await res.json();
    allUsers = data.users || [];

    loadingEl.hidden = true;
    panelEl.hidden = false;
    renderUsers(allUsers);
  } catch (err) {
    loadingEl.hidden = true;
    showError("Couldn't load users. Check your connection and refresh.");
  }
});