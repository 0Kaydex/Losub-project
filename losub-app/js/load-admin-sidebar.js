document.addEventListener("DOMContentLoaded", async () => {

    const placeholder = document.getElementById("adminSidebar");

    if (!placeholder) return;

    const response = await fetch("../components/admin-sidebar.html");

    placeholder.innerHTML = await response.text();

    // Initialize the sidebar after it's in the DOM
    if (window.initAppShell) {
        window.initAppShell();
    }

});