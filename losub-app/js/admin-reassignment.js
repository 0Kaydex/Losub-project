document.addEventListener("DOMContentLoaded", () => {

  // TODO: replace with GET /api/admin/reassignment-queue
  let queue = [
    { id: "r1", outgoingManager: "Tunde A.", plan: "Netflix", flaggedSince: "9 days ago", nextInLine: "Chika N." },
    { id: "r2", outgoingManager: "Samuel T.", plan: "Microsoft 365", flaggedSince: "48h past deadline", nextInLine: "Amaka O." },
  ];

  let activeItem = null;

  function render() {
    const list = document.getElementById("reassignmentList");
    const empty = document.getElementById("reassignmentEmpty");

    if (!queue.length) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }
    list.hidden = false;
    empty.hidden = true;

    list.innerHTML = queue.map(item => `
      <section class="panel" style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
        <div>
          <div class="admin-list__name">${item.plan} — currently managed by ${item.outgoingManager}</div>
          <div class="admin-list__meta">Flagged ${item.flaggedSince} · Next in line: ${item.nextInLine}</div>
        </div>
        <button type="button" class="admin-action-btn admin-action-btn--primary" data-id="${item.id}">Reassign</button>
      </section>
    `).join("");
  }

  document.getElementById("reassignmentList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (!btn) return;
    activeItem = queue.find(i => i.id === btn.dataset.id);
    document.getElementById("reassignModalSub").textContent =
      `${activeItem.plan} will move from ${activeItem.outgoingManager} to ${activeItem.nextInLine}. Both will be notified.`;
    document.getElementById("reassignModalOverlay").hidden = false;
  });

  function closeModal() { document.getElementById("reassignModalOverlay").hidden = true; activeItem = null; }
  document.getElementById("reassignModalClose").addEventListener("click", closeModal);
  document.getElementById("reassignModalCancel").addEventListener("click", closeModal);

  document.getElementById("reassignModalConfirm").addEventListener("click", () => {
    if (!activeItem) return;
    // TODO: call POST /api/admin/reassignment-queue/:id/confirm
    // TODO: this should trigger the same manager-agreement flow for the new manager,
    // and log the action to the audit log
    queue = queue.filter(i => i.id !== activeItem.id);
    closeModal();
    render();
  });

  render();
});