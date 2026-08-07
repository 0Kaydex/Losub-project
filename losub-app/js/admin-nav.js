document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("adminLogout")?.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("losub_admin_token");
    window.location.href = "admin-auth.html";
  });
});