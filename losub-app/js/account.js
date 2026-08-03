document.addEventListener("DOMContentLoaded", () => {

  // ---- Mock data — replace with a real fetch of the logged-in user ----
  const user = {
    fullname: "Chidinma Adaeze",
    email: "chidinma@example.com",
    groups: [
      { plan: "Netflix", role: "member" },
      { plan: "Spotify", role: "manager" },
    ],
  };
  // ---- End mock data ----

  document.getElementById("fullname").value = user.fullname;
  document.getElementById("email").value = user.email;

  const roleSummary = document.getElementById("roleSummary");
  roleSummary.innerHTML = user.groups.map(g => `
    <span class="role-chip ${g.role === 'manager' ? 'role-chip--manager' : ''}">
      ${g.plan} · ${g.role === 'manager' ? 'Manager' : 'Member'}
    </span>
  `).join("");

  document.getElementById("profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    // TODO: call backend to update profile
    console.log("Profile update submitted (front-end only, no backend yet).");
  });

  document.getElementById("passwordForm").addEventListener("submit", (e) => {
    e.preventDefault();
    // TODO: call backend to update password
    console.log("Password update submitted (front-end only, no backend yet).");
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    // TODO: call backend to invalidate session
    console.log("Logout requested (front-end only, no backend yet).");
    window.location.href = "index.html";
  });
});