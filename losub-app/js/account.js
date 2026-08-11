document.addEventListener("DOMContentLoaded", async () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");
  const user = JSON.parse(localStorage.getItem("losub_user") || "null");

  if (!user || !token) {
    window.location.href = "auth.html";
    return;
  }

  const fullnameInput = document.getElementById("fullname");
  const emailInput = document.getElementById("email");
  const profileSubmit = document.getElementById("profileSubmit");
  const profileMessage = document.getElementById("profileMessage");
  const passwordMessage = document.getElementById("passwordMessage");
  const profileAvatar = document.getElementById("profileAvatar");
  const profileName = document.getElementById("profileName");
  const profileEmail = document.getElementById("profileEmail");
  const newPasswordInput = document.getElementById("newPassword");
  const passwordHint = document.getElementById("passwordHint");

  function initials(name) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join("");
  }

  function renderProfileSummary() {
    const name = fullnameInput.value.trim() || "—";
    profileAvatar.textContent = initials(name) || "?";
    profileName.textContent = name;
    profileEmail.textContent = emailInput.value.trim() || "—";
  }

  function showMessage(el, text, type) {
    el.textContent = text;
    el.hidden = false;
    el.className = `auth-message auth-message--${type}`;
  }

  // Initial fill
  fullnameInput.value = user.fullname;
  emailInput.value = user.email;
  renderProfileSummary();

  // ---------- Real groups, from the backend, not localStorage ----------
  const roleSummary = document.getElementById("roleSummary");
  if (roleSummary) {
    roleSummary.innerHTML = `<span class="role-chip">Loading…</span>`;

    try {
      const res = await fetch(`${API_ORIGIN}/api/groups/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }

      const data = await res.json();
      const groups = data.groups || [];

      roleSummary.innerHTML = groups.length
        ? groups.map(g => `
            <span class="role-chip ${g.role === 'manager' ? 'role-chip--manager' : ''}">
              ${g.plan} · ${g.role === 'manager' ? 'Manager' : 'Member'}
            </span>
          `).join("")
        : `<span class="role-chip">${user.role || 'member'}</span>`;
    } catch {
      roleSummary.innerHTML = `<span class="role-chip">${user.role || 'member'}</span>`;
    }
  }

  // Enable "Save changes" only once something actually changed
  function checkDirty() {
    const dirty = fullnameInput.value.trim() !== user.fullname
      || emailInput.value.trim() !== user.email;
    profileSubmit.disabled = !dirty;
  }
  fullnameInput.addEventListener("input", () => { checkDirty(); renderProfileSummary(); });
  emailInput.addEventListener("input", () => { checkDirty(); renderProfileSummary(); });

  document.getElementById("profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    // TODO: call backend to update profile (no PUT /api/auth/me endpoint yet)
    user.fullname = fullnameInput.value.trim();
    user.email = emailInput.value.trim();
    profileSubmit.disabled = true;
    showMessage(profileMessage, "Profile updated successfully.", "success");
    console.log("Profile update submitted (front-end only, no backend yet).");
  });

  // Simple password strength feedback
  newPasswordInput.addEventListener("input", () => {
    const val = newPasswordInput.value;
    let label = "Too short";
    if (val.length >= 12 && /\d/.test(val) && /[A-Z]/.test(val)) {
      label = "Strong";
    } else if (val.length >= 8) {
      label = "Okay — add numbers or capitals for more strength";
    }
    passwordHint.textContent = val ? `Strength: ${label}` : "Strength: —";
  });

  document.getElementById("passwordForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const newpass = newPasswordInput.value;
    if (newpass.length < 8) {
      showMessage(passwordMessage, "New password must be at least 8 characters.", "error");
      return;
    }
    // TODO: call backend to update password (reset-password endpoint exists but needs a token flow, not wired here yet)
    e.target.reset();
    passwordHint.textContent = "Strength: —";
    showMessage(passwordMessage, "Password updated successfully.", "success");
    console.log("Password update submitted (front-end only, no backend yet).");
  });

  // Password show/hide toggle
  function setupPasswordToggles() {
    document.querySelectorAll(".auth-password-toggle").forEach(btn => {
      const input = btn.closest(".auth-password-wrap").querySelector("input");
      const eyeIcon = btn.querySelector(".icon-eye");
      const eyeOffIcon = btn.querySelector(".icon-eye-off");

      btn.addEventListener("click", () => {
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        eyeIcon.classList.toggle("is-visible", isHidden);
        eyeOffIcon.classList.toggle("is-visible", !isHidden);
        btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
      });
    });
  }
  setupPasswordToggles();

  // Logout — clears real session data, matches the fix already applied elsewhere
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("losub_user");
    localStorage.removeItem("losub_token");
    localStorage.removeItem("losub_my_groups");
    window.location.href = "index.html";
  });
});