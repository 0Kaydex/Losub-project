document.addEventListener("DOMContentLoaded", () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  // One retry + timeout, so a slow/cold backend doesn't read as broken.
  async function apiFetch(url, options = {}, { timeoutMs = 8000, retries = 1 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return res;
      } catch (err) {
        clearTimeout(timer);
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function timeLabel(isoString) {
    const d = new Date(isoString + "Z");
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return d.toLocaleString("en-NG", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" });
  }

  let threads = [];
  let activeGroupId = new URLSearchParams(window.location.search).get("group");
  let activeMessages = [];
  let pollTimer = null;

  const initial = name => (name || "?").charAt(0).toUpperCase();

  function renderThreadList() {
    const list = document.getElementById("threadList");

    if (!threads.length) {
      list.innerHTML = `<p class="empty-state">No support conversations yet.</p>`;
      return;
    }

    list.innerHTML = threads.map(t => `
      <div class="thread-list-item ${String(t.groupId) === String(activeGroupId) ? 'is-active' : ''}" data-id="${t.groupId}">
        <span class="thread-list-item__avatar">${initial(t.manager)}</span>
        <div class="thread-list-item__body">
          <div class="thread-list-item__name">${escapeHtml(t.manager)} · ${escapeHtml(t.plan)}</div>
          <div class="thread-list-item__preview">${t.lastMessage ? escapeHtml(t.lastMessage) : ""}</div>
        </div>
      </div>
    `).join("");
  }

  function renderThreadPanel(groupMeta) {
    const panel = document.getElementById("threadPanel");

    if (!activeGroupId) {
      panel.innerHTML = `<p class="empty-state">Select a manager to view the conversation.</p>`;
      return;
    }

    panel.innerHTML = `
      <div class="thread-panel__header">
        <span class="thread-panel__avatar">${initial(groupMeta.manager)}</span>
        <div>
          <div class="thread-panel__name">${escapeHtml(groupMeta.manager)}</div>
          <div class="thread-panel__plan">${escapeHtml(groupMeta.plan)} · Manager</div>
        </div>
      </div>
      <div class="thread-panel__messages" id="threadMessages"></div>
      <div class="thread-panel__composer">
        <input type="text" id="composerInput" placeholder="Message ${escapeHtml(groupMeta.manager)}…" maxlength="1000" />
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
      messagesEl.innerHTML = `<div class="thread-empty">No messages yet.</div>`;
      return;
    }

    messagesEl.innerHTML = activeMessages.map(m => `
      <div class="thread-message thread-message--${m.sender_role === 'admin' ? 'admin' : 'manager'}">
        ${escapeHtml(m.body)}
        <div style="font-size:10px; opacity:.6; margin-top:4px;">${timeLabel(m.created_at)}</div>
      </div>
    `).join("");
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function loadThreads() {
    try {
      const res = await apiFetch(`${API_ORIGIN}/api/admin/messages/threads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      const data = await res.json();
      threads = data.threads || [];
      renderThreadList();
    } catch {
      document.getElementById("threadList").innerHTML = `<p class="empty-state">Couldn't load conversations. Refresh to try again.</p>`;
    }
  }

  async function openGroup(groupId) {
    activeGroupId = groupId;
    renderThreadList();

    try {
      const res = await apiFetch(`${API_ORIGIN}/api/admin/messages/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      if (!res.ok) {
        document.getElementById("threadPanel").innerHTML = `<p class="empty-state">Couldn't load that conversation.</p>`;
        return;
      }
      const data = await res.json();
      activeMessages = data.messages || [];
      renderThreadPanel({ manager: data.manager, plan: data.plan });
    } catch {
      document.getElementById("threadPanel").innerHTML = `<p class="empty-state">Couldn't reach Losub — check your connection and try again.</p>`;
    }

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => refreshActiveThread(groupId), 6000);
  }

  async function refreshActiveThread(groupId) {
    try {
      const res = await apiFetch(`${API_ORIGIN}/api/admin/messages/${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      activeMessages = data.messages || [];
      renderMessages();
    } catch {
      // silent on poll failures
    }
  }

  async function sendMessage() {
    const input = document.getElementById("composerInput");
    const btn = document.getElementById("composerSend");
    const body = input.value.trim();
    if (!body || !activeGroupId) return;

    btn.disabled = true;
    input.disabled = true;

    try {
      const res = await apiFetch(`${API_ORIGIN}/api/admin/messages/${activeGroupId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Couldn't send that message.");
      } else {
        input.value = "";
        await refreshActiveThread(activeGroupId);
        await loadThreads();
      }
    } catch {
      alert("Couldn't reach Losub — check your connection and try again.");
    }

    btn.disabled = false;
    input.disabled = false;
    input.focus();
  }

  document.getElementById("threadList").addEventListener("click", (e) => {
    const item = e.target.closest("[data-id]");
    if (!item) return;
    openGroup(item.dataset.id);
  });

  window.addEventListener("beforeunload", () => { if (pollTimer) clearInterval(pollTimer); });

  loadThreads().then(() => {
    if (activeGroupId) openGroup(activeGroupId);
  });
});
