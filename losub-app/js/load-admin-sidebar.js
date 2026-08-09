document.addEventListener("DOMContentLoaded", async () => {

    const placeholder = document.getElementById("adminSidebar");

    if (!placeholder) return;

    const response = await fetch("../components/admin-sidebar.html");

    placeholder.innerHTML = await response.text();

    // ---- Role check + owner-only sidebar items ----
    const user = JSON.parse(localStorage.getItem("losub_user"));

    if (!user) {
        window.location.href = "auth.html";
        return;
    }

    if (user.role !== "admin" && user.role !== "owner") {
        window.location.href = "index.html";
        return;
    }

    if (user.role === "owner") {
    const divider = document.getElementById("ownerDivider");
    if (divider) divider.style.display = "";
    document.querySelectorAll(".owner-only").forEach(el => { el.style.display = ""; });
}
    // Fix logout — clear real storage, not just redirect
    const logoutBtn = document.getElementById("adminLogout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            localStorage.removeItem("losub_user");
            localStorage.removeItem("losub_token");
            localStorage.removeItem("losub_my_groups");
            window.location.href = "auth.html";
        });
    }
    // ---- End role check ----

    // Initialize the sidebar after it's in the DOM
    if (window.initAppShell) {
        window.initAppShell();
    }

});