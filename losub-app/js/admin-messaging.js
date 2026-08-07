document.addEventListener("DOMContentLoaded", () => {

  // TODO: replace with GET /api/admin/messaging/threads
  const threads = [
    { id: "t1", name: "Tunde A.", plan: "Netflix", status: "flagged", messages: [
      { from: "admin", text: "Hi Tunde, we noticed no login in 9 days — please confirm you're still able to manage this group." },
      { from: "manager", text: "Sorry, I was traveling. I'm back now, will check seats today." },
    ]},
    { id: "t2", name: "Samuel T.", plan: "Microsoft 365", status: "flagged", messages: [
      { from: "admin", text: "Please respond within 48 hours or the group will be reassigned." },
    ]},
    { id: "t3", name: "Ngozi E.", plan: "Spotify", status: "active", messages: [
      { from: "admin", text: "Your partner offer has been approved — no fee going forward. Thanks for staying active!" },
      { from: "manager", text: "Thank you!" },
    ]},
  ];

  let activeThreadId = null;
  const initial = name => name.charAt(0);

  function renderThreadList() {
    const list = document.getElementById("threadList");
    list.innerHTML = threads.map(t => {
      const last = t.messages[t.messages.length - 1];
      return `
        <div class="thread-list-item ${t.id === activeThreadId ? 'is-active' : ''}" data-id="${t.id}">
          <span class="thread-list-item__avatar">${initial(t.name)}</span>
          <div class="thread-list-item__body">
            <div class="thread-list-item__name">${t.name} · ${t.plan}</div>
            <div class="thread-list-item__preview">${last ? last.text : ""}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderThreadPanel() {
    const panel = document.getElementById("threadPanel");
    const thread = threads.find(t => t.id === activeThreadId);

    if (!thread) {
      panel.innerHTML = `<div class="thread-empty">Select a manager to view the conversation.</div>`;
      return;
    }

    const statusLabel = { active: "Active", flagged: "Flagged" };

    panel.innerHTML = `
      <div class="thread-panel__header">
        <span class="thread-panel__avatar">${initial(thread.name)}</span>
        <div>
          <div class="thread-panel__name">${thread.name}</div>
          <div class="thread-panel__plan">${thread.plan} · Manager</div>
        </div>
        <span class="thread-panel__status thread-panel__status--${thread.status}">${statusLabel[thread.status]}</span>
      </div>
      <div class="thread-panel__messages" id="threadMessages">
        ${thread.messages.map(m => `<div class="thread-message thread-message--${m.from}">${m.text}</div>`).join("")}
      </div>
      <div class="thread-panel__composer">
        <input type="text" id="composerInput" placeholder="Message ${thread.name}…" />
        <button type="button" class="admin-action-btn admin-action-btn--primary" id="composerSend">Send</button>
      </div>
    `;

    const messagesEl = document.getElementById("threadMessages");
    messagesEl.scrollTop = messagesEl.scrollHeight;

    document.getElementById("composerSend").addEventListener("click", sendMessage);
    document.getElementById("composerInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  }

  function sendMessage() {
    const input = document.getElementById("composerInput");
    const text = input.value.trim();
    if (!text) return;

    const thread = threads.find(t => t.id === activeThreadId);
    thread.messages.push({ from: "admin", text });
    // TODO: call POST /api/admin/messaging/threads/:id/messages
    input.value = "";
    renderThreadPanel();
    renderThreadList();
  }

  document.getElementById("threadList").addEventListener("click", (e) => {
    const item = e.target.closest("[data-id]");
    if (!item) return;
    activeThreadId = item.dataset.id;
    renderThreadList();
    renderThreadPanel();
  });

  renderThreadList();
});