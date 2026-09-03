document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  let allGroups = [];
  let searchTerm = "";
  let currentStatus = "all";
  const fmt = n => `₦${n.toLocaleString()}`;
  const statusClass = { active: "paid", full: "full" };
  const statusLabel = { active: "Active", full: "Full" };

  function getFiltered() {
    return allGroups.filter(g => {
      const matchesStatus = currentStatus === "all" || g.status === currentStatus;
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
      <tr>
        <td>${g.plan}</td>
        <td>${g.manager}</td>
        <td>${g.seatsFilled}/${g.seatsTotal}</td>
        <td>${fmt(g.monthlyRevenue)}</td>
        <td><span class="status-pill status-pill--${statusClass[g.status] || 'paid'}">${statusLabel[g.status] || g.status}</span></td>
        <td><button type="button" class="admin-action-btn admin-action-btn--danger" data-delete-id="${g.id}" data-plan="${g.plan}">Delete</button></td>
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

  // Deleting a group removes it for everyone in it — the manager and every member
  // lose access at once, not just their own seat. Confirm that clearly before it happens.
  document.getElementById("groupsTableBody").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-delete-id]");
    if (!btn) return;

    const id = btn.dataset.deleteId;
    const plan = btn.dataset.plan;
    const ok = confirm(
      `Delete this "${plan}" group? This removes the manager and every member's access immediately — no refunds happen automatically.`
    );
    if (!ok) return;

    btn.disabled = true;
    btn.textContent = "Deleting…";

    try {
      const res = await fetch(`${API_ORIGIN}/api/admin/groups/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Couldn't delete that group.");
        btn.disabled = false;
        btn.textContent = "Delete";
        return;
      }

      allGroups = allGroups.filter(g => String(g.id) !== id);
      render();
      alert(data.message || "Group deleted.");
    } catch {
      alert("Network error — try again.");
      btn.disabled = false;
      btn.textContent = "Delete";
    }
  });

  async function loadGroups() {
    try {
      const res = await fetch(`${API_ORIGIN}/api/admin/groups`, {
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