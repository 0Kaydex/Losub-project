// Uses Node's built-in SQLite (node:sqlite) — no native compilation needed.
// Requires Node.js 22.5+. Check with `node -v`. If you're on an older
// version, let me know and I'll swap this for the `sql.js` package instead.
const { DatabaseSync } = require("node:sqlite");
const path = require("path");

// Locally: stores losub.db next to this file, as before.
// In production (Fly.io): set DB_PATH=/data/losub.db to write to the
// persistent volume instead of the container's ephemeral filesystem.
const dbPath = process.env.DB_PATH || path.join(__dirname, "losub.db");
console.log("DATABASE PATH:", dbPath);
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,              -- NULL for Google-only accounts
    google_id TEXT,                  -- NULL for email/password accounts
    auth_provider TEXT NOT NULL DEFAULT 'local', -- 'local' or 'google'
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    type TEXT NOT NULL, -- 'verify' or 'reset'
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Lightweight migration for anyone who already ran an earlier version of
// this schema (pre Google Sign-In) — safe to run every startup.
const migrations = [
  "ALTER TABLE users ADD COLUMN google_id TEXT",
  "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local'",
  "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'",
  "ALTER TABLE users ADD COLUMN wallet_balance INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0",
];


for (const sql of migrations) {
  try {
    db.exec(sql);
  } catch (err) {
    // Ignore "duplicate column" errors — means it already ran before
    if (!/duplicate column/i.test(err.message)) console.error("Migration warning:", err.message);
  }
}

// SQLite treats every NULL as distinct under a UNIQUE index, so this still
// lets unlimited email/password users have google_id = NULL, while
// preventing two different users from ever sharing the same google_id.
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)");

db.exec(`
  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,              -- 'fund', 'plan_payment', 'airtime', 'data'
    description TEXT NOT NULL,
    amount INTEGER NOT NULL,         -- kobo; positive = credit, negative = debit
    status TEXT NOT NULL DEFAULT 'success',
    reference TEXT,                  -- Paystack reference, for funding transactions
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    logo TEXT,
    color TEXT,
    solo_price INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    manager_id INTEGER NOT NULL,
    seats_total INTEGER NOT NULL,
    price_per_seat INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (plan_id) REFERENCES plans(id),
    FOREIGN KEY (manager_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    payment_status TEXT NOT NULL DEFAULT 'paid',
    next_payment_date TEXT,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_unique ON group_members(group_id, user_id)");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_reference ON wallet_transactions(reference) WHERE reference IS NOT NULL");

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general',
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

module.exports = db;
