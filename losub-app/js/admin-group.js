document.addEventListener("DOMContentLoaded", () => {

  // TODO: replace with GET /api/admin/groups
  const groups = [
    { plan: "Spotify", manager: "Ngozi E.", seatsFilled: 5, seatsTotal: 6, price: 800, status: "active" },
    { plan: "Netflix", manager: "Tunde A.", seatsFilled: 3, seatsTotal: 4, price: 1500, status: "flagged" },
    { plan: "Capcut", manager: "David O.", seatsFilled: 1, seatsTotal: 2, price: 2700, status: "active" },
    { plan: "youtube", manager: "Ifeoma K.", seatsFilled: 4, seatsTotal: 4, price: 900, status: "full" },
    { plan: "Disney+", manager: "Femi A.", seatsFilled: 3, seatsTotal: 6, price: 1300, status: "active" },
    { plan: "Microsoft 365", manager: "Samuel T.", seatsFilled: 5, seatsTotal: 5, price: 1200, status: "flagged" },
  ];

  let searchTerm = "";
  let currentStatus = "all";
  const fmt = n => `₦${n.toLocaleString()}`;
  const statusClass = { active: "paid", flagged: "defaulted", full: "full" };
  const statusLabel = { active: "Active", flagged: "Flagged", full: "Full" };

  function getFiltered() {
    return groups.filter(g => {
      const matchesStatus = currentStatus === "all" || g.status === currentStatus;
      const matchesSearch = g.plan.toLowerCase().includes(searchTerm.toLowerCase()) || g.manager.toLowerCase().includes(searchTerm.toLowerCase());
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
        <td>${fmt(g.price * g.seatsFilled)}</td>
        <td><span class="status-pill status-pill--${statusClass[g.status]}">${statusLabel[g.status]}</span></td>
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

  render();
});