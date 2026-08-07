async function loadComponent(id, file) {

    const element = document.getElementById(id);

    if (!element) return;

    const response = await fetch(file);

    element.innerHTML = await response.text();
}

document.addEventListener("DOMContentLoaded", async () => {

    await loadComponent(
        "userSidebar",
        "../components/user-sidebar.html"
    );

    await loadComponent(
        "userTopbar",
        "../components/user-topbar.html"
    );

    window.initAppShell();

});