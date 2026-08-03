document.addEventListener("DOMContentLoaded", () => {

  // ---- Mock data — replace with a real fetch ----
  const payments = [
    { date: "Jul 12, 2026", plan: "Netflix", amount: 1500, status: "paid" },
    { date: "Jul 3, 2026", plan: "Spotify", amount: 800, status: "paid" },
    { date: "Jun 12, 2026", plan: "Netflix", amount: 1500, status: "paid" },
    { date: "Jun 3, 2026", plan: "Spotify", amount: 800, status: "failed" },
    { date: "May 12, 2026", plan: "Netflix", amount: 1500, status: "paid" },
  ];
  // ---- End mock data ----

  const fmt = n => `₦${n.toLocaleString()}`;
  const statusLabel = { paid: "Paid", failed: "Failed" };
  let currentFilter = "all";

  function renderSummary() {
    const paidOnly = payments.filter(p => p.status === "paid");
    const total = paidOnly.reduce((sum, p) => sum + p.amount, 0);
    document.getElementById("totalPaid").textContent = fmt(total);
    document.getElementById("paymentCount").textContent = paidOnly.length;
  }

  function renderTable() {
    const body = document.getElementById("phTableBody");
    const table = document.getElementById("phTable");
    const empty = document.getElementById("phEmpty");

    const visible = currentFilter === "all"
      ? payments
      : payments.filter(p => p.status === currentFilter);

    if (!visible.length) {
      table.hidden = true;
      empty.hidden = false;
      return;
    }
    table.hidden = false;
    empty.hidden = true;

    body.innerHTML = visible.map(p => `
      <tr>
        <td>${p.date}</td>
        <td>${p.plan}</td>
        <td>${fmt(p.amount)}</td>
        <td><span class="status-pill status-pill--${p.status}">${statusLabel[p.status]}</span></td>
      </tr>
    `).join("");
  }

  document.getElementById("phTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-bar__btn");
    if (!btn) return;
    document.querySelectorAll("#phTabs .tab-bar__btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    currentFilter = btn.dataset.filter;
    renderTable();
  });

  renderSummary();
  renderTable();
});