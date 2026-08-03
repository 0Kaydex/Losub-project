// Simple localStorage-backed store standing in for a real backend/database.
// Swap these functions for real API calls once the backend exists.

const STORE_KEYS = {
  GROUPS: "losub_my_groups",
  PENDING_JOIN: "losub_pending_join",
  WALLET_BALANCE: "losub_wallet_balance",
  TRANSACTIONS: "losub_transactions",
};

// ---------- Groups ----------
function getMyGroups() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEYS.GROUPS)) || [];
  } catch {
    return [];
  }
}

function saveMyGroups(groups) {
  localStorage.setItem(STORE_KEYS.GROUPS, JSON.stringify(groups));
}

function addGroup(group) {
  const groups = getMyGroups();
  groups.push(group);
  saveMyGroups(groups);
}

function seedGroupsIfEmpty(seed) {
  if (getMyGroups().length === 0) {
    saveMyGroups(seed);
  }
}

// ---------- Pending join (browse → payment handoff) ----------
function setPendingJoin(data) {
  localStorage.setItem(STORE_KEYS.PENDING_JOIN, JSON.stringify(data));
}

function getPendingJoin() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEYS.PENDING_JOIN)) || null;
  } catch {
    return null;
  }
}

function clearPendingJoin() {
  localStorage.removeItem(STORE_KEYS.PENDING_JOIN);
}

// ---------- Wallet ----------
function getWalletBalance() {
  const raw = localStorage.getItem(STORE_KEYS.WALLET_BALANCE);
  return raw === null ? 0 : Number(raw);
}

function setWalletBalance(amount) {
  localStorage.setItem(STORE_KEYS.WALLET_BALANCE, String(amount));
}

function seedWalletIfEmpty(startingBalance) {
  if (localStorage.getItem(STORE_KEYS.WALLET_BALANCE) === null) {
    setWalletBalance(startingBalance);
  }
}

// ---------- Transactions ----------
function getTransactions() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEYS.TRANSACTIONS)) || [];
  } catch {
    return [];
  }
}

function saveTransactions(transactions) {
  localStorage.setItem(STORE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
}

// type: 'fund' | 'plan_payment' | 'airtime' | 'data'
// amount: positive for funding, negative for spending
function addTransaction({ type, description, amount, status = "success" }) {
  const transactions = getTransactions();
  transactions.unshift({
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    description,
    amount,
    status,
    date: new Date().toISOString(),
  });
  saveTransactions(transactions);
}

function seedTransactionsIfEmpty(seed) {
  if (getTransactions().length === 0) {
    saveTransactions(seed);
  }
}

// ---------- Wallet-gated actions ----------
// Returns { ok: true } if the deduction succeeded, or { ok: false } if balance was too low.
// This is the single choke point every spend (plan join, airtime, data) should go through.
function tryDeductFromWallet(amount, description, type) {
  const balance = getWalletBalance();
  if (balance < amount) {
    return { ok: false, balance };
  }
  setWalletBalance(balance - amount);
  addTransaction({ type, description, amount: -amount, status: "success" });
  return { ok: true, balance: balance - amount };
}