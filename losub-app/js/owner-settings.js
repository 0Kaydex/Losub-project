document.addEventListener("DOMContentLoaded", async () => {

const API_ORIGIN = "https://api.losubapp.com";
const API_BASE = `${API_ORIGIN}/api`;

  const user = JSON.parse(localStorage.getItem("losub_user"));
  const token = localStorage.getItem("losub_token");

  if (!user || !token) {
    window.location.href = "auth.html";
    return;
  }
  if (user.role !== "owner") {
    window.location.href = "index.html";
    return;
  }

  const healthDot = document.getElementById("healthDot");
  const healthText = document.getElementById("healthText");
  const healthMeta = document.getElementById("healthMeta");
  const accountInfoList = document.getElementById("accountInfoList");

  // ---------- Account info (from local session, always available) ----------
  accountInfoList.innerHTML = `
    <li><div class="admin-list__name">Name</div><div class="admin-list__meta">${user.fullname}</div></li>
    <li><div class="admin-list__name">Email</div><div class="admin-list__meta">${user.email}</div></li>
    <li><div class="admin-list__name">Role</div><div class="admin-list__meta">${user.role}</div></li>
  `;

  // ---------- Backend health check ----------
  try {
    const started = performance.now();
    const res = await fetch(`${API_ORIGIN}/api/health`);
    const elapsed = Math.round(performance.now() - started);

    if (!res.ok) throw new Error("Bad status");
    const data = await res.json();

    healthDot.classList.add("owner-status-dot--ok");
    healthText.textContent = data.message || "Backend is running.";
    healthMeta.textContent = `Responded in ${elapsed}ms.`;
  } catch (err) {
    healthDot.classList.add("owner-status-dot--error");
    healthText.textContent = "Backend unreachable.";
    healthMeta.textContent = "Couldn't reach /api/health — check the deployment.";
  }
});