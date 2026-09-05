document.addEventListener("DOMContentLoaded", async () => {

  const API_ORIGIN = "https://api.losubapp.com";
  const token = localStorage.getItem("losub_token");

  if (!token) {
    window.location.href = "auth.html";
    return;
  }

  let currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem("losub_user") || "null"); } catch {}
  const myId = currentUser?.id ?? null;

  const params = new URLSearchParams(window.location.search);
  const groupId = params.get("id") || params.get("group");
  let activeThread = params.get("thread") === "support" ? "support" : "group";

  // ---------- Small fetch helper: one retry + timeout, so a slow/cold
  // backend doesn't immediately surface as "network error" ----------
  async function apiFetch(path, options = {}, { timeoutMs = 8000, retries = 1 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${API_ORIGIN}${path}`, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return res;
      } catch (err) {
        clearTimeout(timer);
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  function fmt(n) { return `₦${n.toLocaleString()}`; }

  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("msgToast");
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3000);
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

  function fallbackLogo(name) {
    return `https://cdn.simpleicons.org/${name.toLowerCase().replace(/\s+/g, "")}/6B7280`;
  }

  // =========================================================================
  // GROUP PICKER — shown when no ?group= is in the URL
  // =========================================================================
  async function renderGroupPicker() {
    document.getElementById("groupPicker").hidden = false;
    document.getElementById("inboxView").hidden = true;

    const list = document.getElementById("msgGroupList");
    const empty = document.getElementById("msgGroupEmpty");

    try {
      const res = await apiFetch(`/api/groups/mine`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      const data = await res.json();
      const groups = data.groups || [];

      if (!groups.length) {
        list.hidden = true;
        empty.hidden = false;
        return;
      }
      list.hidden = false;
      empty.hidden = true;

      list.innerHTML = groups.map(g => `
        <button type="button" class="msg-group-card" data-id="${g.id}">
          <img src="${g.logo || fallbackLogo(g.plan)}" alt="" class="msg-group-card__icon" style="background:${(g.color || '#111827')}1A;" />
          <div class="msg-group-card__body">
            <div class="msg-group-card__name">${g.plan}</div>
            <div class="msg-group-card__role">${g.role === "manager" ? "You manage this group" : `Managed by ${g.manager}`}</div>
          </div>
          <span class="msg-group-card__badge">${g.role === "manager" ? "Manager" : "Member"}</span>
        </button>
      `).join("");

      list.querySelectorAll(".msg-group-card").forEach(card => {
        card.addEventListener("click", () => {
          window.location.href = `messages.html?group=${card.dataset.id}`;
        });
      });
    } catch {
      showToast("Couldn't reach Losub — check your connection and try again.");
      list.hidden = true;
      empty.hidden = false;
      empty.textContent = "Couldn't load your groups. Refresh to try again.";
    }
  }

  // =========================================================================
  // INBOX — shown when a ?group= is in the URL
  // =========================================================================
  let isManager = false;
  let pollTimer = null;

  async function renderInbox() {
    document.getElementById("groupPicker").hidden = true;
    document.getElementById("inboxView").hidden = false;

    try {
      const res = await apiFetch(`/api/groups/${groupId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      if (res.status === 403 || res.status === 404) {
        showToast("You don't have access to that group's inbox.");
        setTimeout(() => window.location.href = "messages.html", 1200);
        return;
      }
      const group = await res.json();
      isManager = group.yourRole === "manager";

      document.getElementById("inboxGroupName").textContent = `${group.plan} inbox`;
      document.getElementById("supportTabBtn").hidden = !isManager;

      if (activeThread === "support" && !isManager) activeThread = "group";
      setActiveTab(activeThread);
    } catch {
      showToast("Couldn't reach Losub — check your connection and try again.");
      return;
    }

    await loadMessages();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(loadMessages, 6000);
  }

  function setActiveTab(thread) {
    activeThread = thread;
    document.querySelectorAll("#inboxTabs .tab-bar__btn").forEach(b => {
      b.classList.toggle("is-active", b.dataset.thread === thread);
    });
  }

  document.getElementById("inboxTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-bar__btn");
    if (!btn || btn.hidden) return;
    setActiveTab(btn.dataset.thread);
    loadMessages();
  });

  async function loadMessages() {
    const threadEl = document.getElementById("msgThread");
    const emptyEl = document.getElementById("msgThreadEmpty");

    try {
      const res = await apiFetch(
        `/api/groups/${groupId}/messages?thread=${activeThread}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 401) { window.location.href = "auth.html"; return; }
      if (!res.ok) throw new Error("failed");

      const data = await res.json();
      const messages = data.messages || [];

      if (!messages.length) {
        threadEl.innerHTML = "";
        threadEl.hidden = true;
        emptyEl.hidden = false;
        return;
      }
      threadEl.hidden = false;
      emptyEl.hidden = true;

      const wasAtBottom = threadEl.scrollTop + threadEl.clientHeight >= threadEl.scrollHeight - 40;

      threadEl.innerHTML = messages.map(m => {
        const mine = myId !== null && String(m.sender_id) === String(myId);
        const rowClass = mine ? "mine" : (m.sender_role === "admin" ? "admin" : "theirs");
        const roleLabel = m.sender_role === "manager" ? "Manager" : m.sender_role === "admin" ? "Losub" : "Member";
        return `
          <div class="msg-bubble-row msg-bubble-row--${rowClass}">
            <span class="msg-bubble-meta">${mine ? "You" : m.sender_name} · ${roleLabel}</span>
            <div class="msg-bubble">${escapeHtml(m.body)}</div>
            <span class="msg-bubble-time">${timeLabel(m.created_at)}</span>
          </div>
        `;
      }).join("");

      if (wasAtBottom) threadEl.scrollTop = threadEl.scrollHeight;
    } catch {
      // Silent on poll failures — avoid spamming toasts every 6s.
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById("msgComposer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("msgInput");
    const btn = document.getElementById("msgSendBtn");
    const body = input.value.trim();
    if (!body) return;

    btn.disabled = true;
    input.disabled = true;

    try {
      const res = await apiFetch(`/api/groups/${groupId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ thread: activeThread, body }),
      }, { retries: 1 });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Couldn't send that message.");
      } else {
        input.value = "";
        await loadMessages();
        const threadEl = document.getElementById("msgThread");
        threadEl.scrollTop = threadEl.scrollHeight;
      }
    } catch {
      showToast("Couldn't send — check your connection and try again.");
    }

    btn.disabled = false;
    input.disabled = false;
    input.focus();
  });

  document.getElementById("msgBackBtn").addEventListener("click", () => {
    if (pollTimer) clearInterval(pollTimer);
    window.location.href = "messages.html";
  });

  // ---------- Boot ----------
  if (groupId) {
    renderInbox();
  } else {
    renderGroupPicker();
  }

  window.addEventListener("beforeunload", () => { if (pollTimer) clearInterval(pollTimer); });
});
