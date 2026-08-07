document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("admin-login-form");
  const messageBox = document.getElementById("adminAuthMessage");

  function showMessage(text, type = "error") {
    messageBox.textContent = text;
    messageBox.className = `auth-message auth-message--${type}`;
    messageBox.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    const btn = form.querySelector(".auth-submit");
    btn.disabled = true;
    btn.textContent = "Signing in…";

    try {
      // TODO: replace with a real POST to /api/admin/login once the backend
      // has admin role-checking. This must be a SEPARATE endpoint from
      // /api/auth/login — never reuse the regular user login for admin access.
      const res = await fetch(`${API_BASE_URL}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign in failed.");

      // Stored under a separate key from the regular user session on purpose —
      // an admin token and a member token should never be interchangeable.
      localStorage.setItem("losub_admin_token", data.token);
      window.location.href = "admin-dashboard.html";
    } catch (err) {
      showMessage(err.message || "Couldn't reach the server. Try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign in";
    }
  });
});