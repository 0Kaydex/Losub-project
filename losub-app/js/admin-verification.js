document.addEventListener("DOMContentLoaded", () => {

  // TODO: replace with GET /api/admin/verifications
  let submissions = [
    { id: "v1", name: "David O.", plan: "Capcut", submitted: "2h ago" },
    { id: "v2", name: "Femi A.", plan: "Disney+", submitted: "1d ago" },
    { id: "v3", name: "Yusuf B.", plan: "Duolingo", submitted: "2d ago" },
  ];

  let activeSubmission = null;

  function render() {
    const grid = document.getElementById("verificationGrid");
    const empty = document.getElementById("verificationEmpty");

    if (!submissions.length) {
      grid.hidden = true;
      empty.hidden = false;
      return;
    }
    grid.hidden = false;
    empty.hidden = true;

    grid.innerHTML = submissions.map(s => `
      <article class="verification-card">
        <div class="verification-card__top">
          <div>
            <div class="verification-card__name">${s.name}</div>
            <div class="verification-card__plan">${s.plan}</div>
          </div>
          <span class="admin-list__meta">${s.submitted}</span>
        </div>
        <div class="verification-card__proof">Proof-of-plan screenshot</div>
        <div class="verification-card__actions">
          <button type="button" class="admin-action-btn admin-action-btn--primary" data-action="approve" data-id="${s.id}">Approve</button>
          <button type="button" class="admin-action-btn admin-action-btn--danger" data-action="reject" data-id="${s.id}">Reject</button>
        </div>
        <label class="verification-card__partner">
          <input type="checkbox" data-partner="${s.id}" />
          Grant zero-fee partner offer on approval
        </label>
      </article>
    `).join("");
  }

  document.getElementById("verificationGrid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const submission = submissions.find(s => s.id === btn.dataset.id);

    if (btn.dataset.action === "approve") {
      const grantPartner = document.querySelector(`[data-partner="${submission.id}"]`).checked;
      // TODO: call POST /api/admin/verifications/:id/approve { grantPartner }
      // TODO: log this action to the audit log
      submissions = submissions.filter(s => s.id !== submission.id);
      render();
    } else {
      activeSubmission = submission;
      document.getElementById("verificationModalOverlay").hidden = false;
    }
  });

  function closeModal() { document.getElementById("verificationModalOverlay").hidden = true; activeSubmission = null; }
  document.getElementById("verificationModalClose").addEventListener("click", closeModal);
  document.getElementById("verificationModalCancel").addEventListener("click", closeModal);

  document.getElementById("verificationModalConfirm").addEventListener("click", () => {
    if (!activeSubmission) return;
    // TODO: call POST /api/admin/verifications/:id/reject
    // TODO: log this action to the audit log
    submissions = submissions.filter(s => s.id !== activeSubmission.id);
    closeModal();
    render();
  });

  render();
});