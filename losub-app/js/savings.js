document.addEventListener("DOMContentLoaded", () => {

  // ---- Mock data — replace with a real fetch ----
  const groups = [
    { plan: "Netflix", color: "#D85A30", soloPrice: 5200, yourPrice: 1500 },
    { plan: "Spotify", color: "#1D9E75", soloPrice: 3200, yourPrice: 800 },
  ];
  // ---- End mock data ----

  const fmt = n => `₦${n.toLocaleString()}`;

  // Savings formula: solo price (what you'd pay alone) minus what you actually pay on Losub
  const totalSolo = groups.reduce((sum, g) => sum + g.soloPrice, 0);
  const totalYours = groups.reduce((sum, g) => sum + g.yourPrice, 0);
  const totalSaved = totalSolo - totalYours;
  const percentSaved = totalSolo > 0 ? Math.round((totalSaved / totalSolo) * 100) : 0;

  document.getElementById("totalSaved").textContent = fmt(totalSaved);
  document.getElementById("savedPercent").textContent = `That's ${percentSaved}% less than paying alone`;

  const breakdown = document.getElementById("savingsBreakdown");
  breakdown.innerHTML = `
    <div class="savings-head">
      <span>Plan</span>
      <span>Solo price</span>
      <span>You pay</span>
      <span class="savings-head__saved-col">You save</span>
    </div>
  ` + groups.map(g => {
    const saved = g.soloPrice - g.yourPrice;
    return `
      <div class="savings-row">
        <span class="savings-row__plan">
          <span class="savings-row__dot" style="background:${g.color}"></span>
          ${g.plan}
        </span>
        <span class="savings-row__value">${fmt(g.soloPrice)}</span>
        <span class="savings-row__value">${fmt(g.yourPrice)}</span>
        <span class="savings-row__value savings-row__saved savings-row__saved-col">${fmt(saved)}</span>
      </div>
    `;
  }).join("");
});


