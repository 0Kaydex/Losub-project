document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  let threads = [];
  let activeManagerId = null;
  let activeMessages = [];
  let pollTimer = null;

  const initial = name => name.charAt(0);

  function timeAgo(isoString) {
    if (!isoString) return "";
    const diffMs = Date.now() - new Date(isoString + "Z").getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function renderThreadList() {
    const list = document.getElementById("threadList");
    if (!threads.length) {
      list.innerHTML = `<p class="empty-state">No managers yet — threads appear here once someone becomes an account manager.</p>`;
      return;
    }
    list.innerHTML = threads.map(t => `
      <div class="thread-list-item ${t.managerId === activeManagerId ? 'is-active' : ''}" data-id="${t.managerId}">
        <span class="thread-list-item__avatar">${initial(t.name)}</span>
        <div class="thread-list-item__body">
          <div class="thread-list-item__name">${t.name}</div>
          <div class="thread-list-item__preview">${t.lastMessage ? t.lastMessage : "No messages yet"}</div>
        </div>
      </div>
    `).join("");
  }

  function renderThreadPanel() {
    const panel = document.getElementById("threadPanel");
    const thread = threads.find(t => t.managerId === activeManagerId);

    if (!thread) {
      panel.innerHTML = `<div class="thread-empty">Select a manager to view the conversation.</div>`;
      return;
    }

    panel.innerHTML = `
      <div class="thread-panel__header">
        <span class="thread-panel__avatar">${initial(thread.name)}</span>
        <div>
          <div class="thread-panel__name">${thread.name}</div>
          <div class="thread-panel__plan">${thread.email} · Manager</div>
        </div>
      </div>
      <div class="thread-panel__messages" id="threadMessages"></div>
      <p class="thread-panel__error" id="composerError" hidden></p>
      <div class="thread-panel__composer">
        <input type="text" id="composerInput" placeholder="Message ${thread.name}…" maxlength="2000" />
        <button type="button" class="admin-action-btn admin-action-btn--primary" id="composerSend">Send</button>
      </div>
    `;

    renderMessages();

    document.getElementById("composerSend").addEventListener("click", sendMessage);
    document.getElementById("composerInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  }

  function renderMessages() {
    const messagesEl = document.getElementById("threadMessages");
    if (!messagesEl) return;
    if (!activeMessages.length) {
      messagesEl.innerHTML = `<div class="thread-empty">No messages yet — say hello.</div>`;
      return;
    }
    messagesEl.innerHTML = activeMessages.map(m => `
      <div class="thread-message thread-message--${m.sender_role === 'manager' ? 'manager' : 'admin'}">${m.text}</div>
    `).join("");
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function loadThreads() {
    try {
      const res = await fetch(`${API_ORIGIN}/api/messages/managers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      if (res.status === 403) {
        document.getElementById("threadList").innerHTML = `<p class="empty-state">Admin access required.</p>`;
        return;
      }
      const data = await res.json();
      threads = data.threads || [];
      renderThreadList();
    } catch {
      document.getElementById("threadList").innerHTML = `<p class="empty-state">Couldn't load managers. Refresh to try again.</p>`;
    }
  }

  // Pull the latest messages for whichever manager thread is open, without
  // resetting the composer or scroll position — used both on first open and
  // on the background poll so a manager's reply shows up without a manual refresh.
  async function refreshActiveThread({ silent } = {}) {
    if (!activeManagerId) return;
    try {
      const res = await fetch(`${API_ORIGIN}/api/messages/manager/${activeManagerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      activeMessages = data.messages || [];
      renderMessages();
    } catch {
      if (!silent) {
        activeMessages = [];
        renderMessages();
      }
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      refreshActiveThread({ silent: true });
      loadThreads();
    }, 8000);
  }
  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function openThread(managerId) {
    activeManagerId = managerId;
    renderThreadList();
    renderThreadPanel();
    await refreshActiveThread();
    startPolling();
  }

  async function sendMessage() {
    const input = document.getElementById("composerInput");
    const errorEl = document.getElementById("composerError");
    const text = input.value.trim();
    if (!text || !activeManagerId) return;

    const btn = document.getElementById("composerSend");
    btn.disabled = true;
    if (errorEl) errorEl.hidden = true;

    try {
      const res = await fetch(`${API_ORIGIN}/api/messages/manager/${activeManagerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (res.ok) {
        activeMessages.push(data.message);
        input.value = "";
        renderMessages();
        loadThreads(); // refresh preview text in the sidebar
      } else if (errorEl) {
        errorEl.textContent = data.error || "Couldn't send that message — try again.";
        errorEl.hidden = false;
      }
    } catch {
      if (errorEl) {
        errorEl.textContent = "Network error — try again.";
        errorEl.hidden = false;
      }
      // leave the input filled so the user can retry
    }
    btn.disabled = false;
  }

  document.getElementById("threadList").addEventListener("click", (e) => {
    const item = e.target.closest("[data-id]");
    if (!item) return;
    openThread(Number(item.dataset.id));
  });

  window.addEventListener("beforeunload", stopPolling);

  loadThreads();
});
