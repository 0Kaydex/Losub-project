document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  let transactions = [];

  const fmt = n => `₦${Math.abs(n).toLocaleString()}`;
  let searchTerm = "";

  function renderStats() {
    const totalFunded = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const totalSpent = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    document.getElementById("statTotalFunded").textContent = fmt(totalFunded);
    document.getElementById("statTotalSpent").textContent = fmt(totalSpent);
    document.getElementById("statHeldBalance").textContent = fmt(totalFunded - totalSpent);
  }

  function getFiltered() {
    return transactions.filter(t =>
      t.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  function renderTable() {
    const body = document.getElementById("adminTxTableBody");
    const empty = document.getElementById("adminTxEmpty");
    const visible = getFiltered();

    if (!visible.length) {
      body.closest("table").hidden = true;
      empty.hidden = false;
      return;
    }
    body.closest("table").hidden = false;
    empty.hidden = true;

    body.innerHTML = visible.map(t => `
      <tr>
        <td>${t.date}</td>
        <td>${t.user}</td>
        <td>${t.type.replace("_", " ")}</td>
        <td>${t.description}</td>
        <td style="color:${t.amount > 0 ? '#1f5c3f' : '#8c2a3f'}; font-weight:700;">${t.amount > 0 ? '+' : '-'}${fmt(t.amount)}</td>
      </tr>
    `).join("");
  }

  document.getElementById("txSearch").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderTable();
  });

  document.getElementById("downloadAdminPdf").addEventListener("click", () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const visible = getFiltered();

    doc.setFontSize(16);
    doc.text("Losub — Platform Wallet Report", 14, 18);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 25);

    let y = 40;
    doc.setFontSize(11);
    doc.text("Date", 14, y); doc.text("User", 55, y); doc.text("Description", 105, y); doc.text("Amount", 175, y);
    y += 6;
    doc.line(14, y - 3, 196, y - 3);

    visible.forEach(t => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(t.date, 14, y);
      doc.text(t.user, 55, y);
      doc.text(t.description, 105, y);
      doc.text(`${t.amount > 0 ? "+" : "-"}${fmt(t.amount)}`, 175, y);
      y += 8;
    });

    doc.save("losub-platform-wallet-report.pdf");
  });

  async function loadTransactions() {
    try {
      const res = await fetch(`${API_ORIGIN}/api/admin/transactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      if (res.status === 403) { window.location.href = "index.html"; return; }

      const data = await res.json();
      transactions = (data.transactions || []).map(t => ({
        ...t,
        date: new Date(t.date + "Z").toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }),
      }));
    } catch {
      transactions = [];
    }
    renderStats();
    renderTable();
  }

  loadTransactions();
});