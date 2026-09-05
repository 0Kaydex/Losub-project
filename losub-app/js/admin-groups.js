document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  // One retry + timeout, so a slow/cold backend doesn't read as broken.
  async function apiFetch(url, options = {}, { timeoutMs = 8000, retries = 1 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return res;
      } catch (err) {
        clearTimeout(timer);
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  const highlightId = new URLSearchParams(window.location.search).get("highlight");

  let allGroups = [];
  let searchTerm = "";
  let currentStatus = "all";
  let pendingDeleteId = null;

  const fmt = n => `₦${n.toLocaleString()}`;
  const statusClass = { active: "paid", full: "full" };
  const statusLabel = { active: "Active", full: "Full" };

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function getFiltered() {
    return allGroups.filter(g => {
      const matchesStatus =
        currentStatus === "all" ||
        (currentStatus === "exit_requested" ? g.exitRequested : g.status === currentStatus);
      const matchesSearch =
        g.plan.toLowerCase().includes(searchTerm.toLowerCase()) ||
        g.manager.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }

  function render() {
    const body = document.getElementById("groupsTableBody");
    const empty = document.getElementById("groupsEmpty");
    const visible = getFiltered();

    if (!visible.length) {
      body.closest("table").hidden = true;
      empty.hidden = false;
      return;
    }
    body.closest("table").hidden = false;
    empty.hidden = true;

    body.innerHTML = visible.map(g => `
      <tr class="${String(g.id) === String(highlightId) ? 'admin-table__row--highlight' : ''}">
        <td>${escapeHtml(g.plan)}</td>
        <td>${escapeHtml(g.manager)}</td>
        <td>${g.seatsFilled}/${g.seatsTotal}</td>
        <td>${fmt(g.monthlyRevenue)}</td>
        <td>
          <span class="status-pill status-pill--${statusClass[g.status] || 'paid'}">${statusLabel[g.status] || g.status}</span>
          ${g.exitRequested ? `<span class="status-pill status-pill--danger" title="${g.exitReason ? escapeHtml(g.exitReason) : ''}">Exit requested</span>` : ""}
        </td>
        <td><button type="button" class="admin-action-btn admin-action-btn--danger" data-id="${g.id}" data-plan="${escapeHtml(g.plan)}" data-manager="${escapeHtml(g.manager)}">Delete</button></td>
      </tr>
    `).join("");
  }

  document.getElementById("groupSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    render();
  });

  document.getElementById("groupStatusTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-bar__btn");
    if (!btn) return;
    document.querySelectorAll("#groupStatusTabs .tab-bar__btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    currentStatus = btn.dataset.status;
    render();
  });

  // ---------- Delete group ----------
  const deleteOverlay = document.getElementById("deleteGroupOverlay");

  function openDeleteModal(id, plan, manager) {
    pendingDeleteId = id;
    document.getElementById("deleteGroupSub").textContent =
      `This removes every member's seat in ${manager}'s ${plan} group and permanently deletes it. This can't be undone.`;
    deleteOverlay.hidden = false;
  }
  function closeDeleteModal() {
    deleteOverlay.hidden = true;
    pendingDeleteId = null;
  }

  document.getElementById("groupsTableBody").addEventListener("click", (e) => {
    const btn = e.target.closest(".admin-action-btn--danger");
    if (btn) openDeleteModal(btn.dataset.id, btn.dataset.plan, btn.dataset.manager);
  });

  document.getElementById("deleteGroupClose").addEventListener("click", closeDeleteModal);
  document.getElementById("cancelDeleteGroup").addEventListener("click", closeDeleteModal);
  deleteOverlay.addEventListener("click", (e) => {
    if (e.target.id === "deleteGroupOverlay") closeDeleteModal();
  });

  document.getElementById("confirmDeleteGroup").addEventListener("click", async () => {
    if (!pendingDeleteId) return;
    const btn = document.getElementById("confirmDeleteGroup");
    btn.disabled = true;

    try {
      const res = await apiFetch(`${API_ORIGIN}/api/admin/groups/${pendingDeleteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Couldn't close that group.");
      } else {
        allGroups = allGroups.filter(g => String(g.id) !== String(pendingDeleteId));
        render();
      }
    } catch {
      alert("Couldn't reach Losub — check your connection and try again.");
    }

    btn.disabled = false;
    closeDeleteModal();
  });

  async function loadGroups() {
    try {
      const res = await apiFetch(`${API_ORIGIN}/api/admin/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      if (res.status === 403) { window.location.href = "index.html"; return; }

      const data = await res.json();
      allGroups = data.groups || [];
      render();
    } catch {
      document.getElementById("groupsEmpty").hidden = false;
      document.getElementById("groupsEmpty").textContent = "Couldn't load groups. Refresh to try again.";
    }
  }

  loadGroups();
});
