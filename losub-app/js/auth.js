document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".auth-toggle");
  const toggleBtns = document.querySelectorAll(".auth-toggle__btn");
  const switchLinks = document.querySelectorAll(".auth-switch__link, .auth-forgot");
  const forms = document.querySelectorAll(".auth-form");

  function showForm(target) {
    toggleBtns.forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.target === target);
    });
    forms.forEach(form => {
      form.classList.toggle("is-active", form.id === `${target}-form`);
    });
    toggle.classList.toggle("is-hidden", target === "forgot" || target === "reset");
    if (target === "signup") toggle.classList.add("is-signup");
    else if (target === "signin") toggle.classList.remove("is-signup");
  }

  toggleBtns.forEach(btn => btn.addEventListener("click", () => showForm(btn.dataset.target)));
  switchLinks.forEach(link => link.addEventListener("click", (e) => {
    e.preventDefault();
    showForm(link.dataset.target);
  }));

  // ---------- Message helper ----------
  function showMessage(form, text, type = "error") {
    const box = form.querySelector('[data-role="message"]');
    box.textContent = text;
    box.className = `auth-message auth-message--${type}`;
    box.hidden = false;
  }

  function clearMessage(form) {
    const box = form.querySelector('[data-role="message"]');
    box.hidden = true;
    box.textContent = "";
  }

  function setLoading(form, isLoading, loadingText, defaultText) {
    const btn = form.querySelector(".auth-submit");
    btn.disabled = isLoading;
    btn.textContent = isLoading ? loadingText : defaultText;
  }

  // ---------- API helper ----------
  async function apiPost(path, body) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  function saveSession(token, user) {
    localStorage.setItem("losub_token", token);
    localStorage.setItem("losub_user", JSON.stringify(user));
  }

  // ---------- Determine which tab to show on load ----------
  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get("tab");
  const resetToken = params.get("token");

  if (requestedTab === "reset" && resetToken) {
    showForm("reset");
  } else if (["signup", "signin", "forgot"].includes(requestedTab)) {
    showForm(requestedTab);
  }

  if (params.get("verified") === "1") {
    showForm("signin");
    showMessage(document.getElementById("signin-form"), "Your email is verified — you can log in now.", "success");
  }

  // ---------- SIGN IN ----------
  const signinForm = document.getElementById("signin-form");
  signinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage(signinForm);
    const email = signinForm.email.value.trim();
    const password = signinForm.password.value;

    setLoading(signinForm, true, "Logging in…", "Log in");
    try {
      const data = await apiPost("/auth/login", { email, password });
      saveSession(data.token, data.user);
      redirectByRole(data.user);

      function redirectByRole(user) {
  if (user.role === "owner" || user.role === "admin") {
    window.location.href = "admin-dashboard.html";
  } else {
    window.location.href = "dashboard.html";
  }
}
    } catch (err) {
      showMessage(signinForm, err.message);
      if (err.message.toLowerCase().includes("verify")) {
        const box = signinForm.querySelector('[data-role="message"]');
        const resendLink = document.createElement("span");
        resendLink.className = "auth-message__resend";
        resendLink.textContent = "Resend verification email";
        resendLink.addEventListener("click", async () => {
          try {
            await apiPost("/auth/resend-verification", { email });
            showMessage(signinForm, "If that account isn't verified yet, a new email is on its way.", "success");
          } catch {
            showMessage(signinForm, "Couldn't resend right now — try again shortly.");
          }
        });
        box.appendChild(document.createElement("br"));
        box.appendChild(resendLink);
      }
    } finally {
      setLoading(signinForm, false, "Logging in…", "Log in");
    }
  });

  // ---------- SIGN UP ----------
  const signupForm = document.getElementById("signup-form");
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage(signupForm);
    const fullname = signupForm.fullname.value.trim();
    const email = signupForm.email.value.trim();
    const password = signupForm.password.value;

    setLoading(signupForm, true, "Creating account…", "Create account");
    try {
      const data = await apiPost("/auth/signup", { fullname, email, password });
      showMessage(signupForm, data.message, data.emailSent === false ? "error" : "success");
      signupForm.reset();
    } catch (err) {
      showMessage(signupForm, err.message);
    } finally {
      setLoading(signupForm, false, "Creating account…", "Create account");
    }
  });

  // ---------- FORGOT PASSWORD ----------
  const forgotForm = document.getElementById("forgot-form");
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage(forgotForm);
    const email = forgotForm.email.value.trim();

    setLoading(forgotForm, true, "Sending…", "Send reset link");
    try {
      const data = await apiPost("/auth/forgot-password", { email });
      showMessage(forgotForm, data.message, "success");
    } catch (err) {
      showMessage(forgotForm, err.message);
    } finally {
      setLoading(forgotForm, false, "Sending…", "Send reset link");
    }
  });

  // ---------- RESET PASSWORD ----------
  const resetForm = document.getElementById("reset-form");
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessage(resetForm);
    const newPassword = resetForm.newPassword.value;

    if (!resetToken) {
      showMessage(resetForm, "This reset link is missing its token. Please request a new one.");
      return;
    }

    setLoading(resetForm, true, "Updating…", "Update password");
    try {
      const data = await apiPost("/auth/reset-password", { token: resetToken, newPassword });
      showMessage(resetForm, `${data.message} Redirecting to log in…`, "success");
      setTimeout(() => { window.location.href = "auth.html?tab=signin"; }, 1800);
    } catch (err) {
      showMessage(resetForm, err.message);
    } finally {
      setLoading(resetForm, false, "Updating…", "Update password");
    }
  });

     // ---------- Password show/hide toggle ----------
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

  function initGoogle() {
  console.log("Google init started");

  if (!window.google || !GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.startsWith("YOUR_")) {
    console.warn("Google Sign-In not configured yet");
    return;
  }

  console.log("Google client:", GOOGLE_CLIENT_ID);

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
  });

  console.log("Google initialized");

  google.accounts.id.renderButton(
    document.getElementById("hiddenGoogleButton"),
    {
      type: "standard",
    }
  );

  console.log("Google button rendered");

  document.querySelectorAll("[data-google-trigger]").forEach(btn => {
  btn.addEventListener("click", () => {
    console.log("Custom Google button clicked");

    google.accounts.id.prompt();
  });
});
}

  async function handleGoogleCredential(response) {
    const activeForm = document.querySelector(".auth-form.is-active");
    try {
      const data = await apiPost("/auth/google", { credential: response.credential });
      saveSession(data.token, data.user);
      redirectByRole(data.user);
    } catch (err) {
      if (activeForm) showMessage(activeForm, err.message);
    }
  }

// Wait until Google Identity Services is available
function waitForGoogle() {
  if (window.google && google.accounts && google.accounts.id) {
    initGoogle();
  } else {
    setTimeout(waitForGoogle, 100);
  }
}

waitForGoogle();
});