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

// WAL lets readers (GET /api/wallet, /api/groups/mine, etc.) run without blocking behind
// a write, instead of every request queuing up on one exclusive file lock. node:sqlite is
// still single-threaded/synchronous per query, so this doesn't make it a "real" concurrent
// database — but it meaningfully reduces the lock contention that shows up as random slow
// or failed requests once more than a couple of people use the site at the same time.
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 5000");

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

const groupMigrations = [
  "ALTER TABLE groups ADD COLUMN access_link TEXT",
  // is_private: when set, the group is invite-only and never appears on the public
  // /api/groups/browse marketplace — only people the manager explicitly invites
  // (see group_invites below) can join it.
  "ALTER TABLE groups ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0",
];
for (const sql of groupMigrations) {
  try {
    db.exec(sql);
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) console.error("Migration warning:", err.message);
  }
}

const planMigrations = [
  // group_price: what the shared/family plan actually costs from the provider (e.g. Spotify
  // Family = ₦2,500) — informational only, for the admin's own margin visibility. Never
  // used in the per-seat math.
  "ALTER TABLE plans ADD COLUMN group_price INTEGER",
  // price_per_seat: what each regular member actually pays for a seat in this plan's
  // groups — set directly by the admin, NOT derived by dividing solo_price or group_price.
  // The manager pays 50% of this. seats_total (chosen per-group) only controls capacity,
  // it no longer affects price.
  "ALTER TABLE plans ADD COLUMN price_per_seat INTEGER",
  // max_seats: how many total seats (including the manager's own) a group for this plan
  // gets. Different services split differently (Netflix = 4, YouTube family = 6, etc.),
  // so this is owner-configurable per plan instead of one hardcoded number for every plan.
  "ALTER TABLE plans ADD COLUMN max_seats INTEGER NOT NULL DEFAULT 4",
];
for (const sql of planMigrations) {
  try {
    db.exec(sql);
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) console.error("Migration warning:", err.message);
  }
}

// group_invites: lets a manager pick specific people to fill their group instead of it
// being a first-come-first-served public marketplace. An invite is matched by email —
// if the invited person already has a Losub account it also gets attached to their
// user_id (and they get a notification); if not, it just sits there by email and
// attaches itself the next time that email signs up... for now it simply stays
// pending until someone with that email logs in and checks their invites.
db.exec(`
  CREATE TABLE IF NOT EXISTS group_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    invited_user_id INTEGER,
    invited_by INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'declined' | 'revoked'
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (group_id) REFERENCES groups(id),
    FOREIGN KEY (invited_by) REFERENCES users(id)
  );
`);
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_group_invites_pending ON group_invites(group_id, email) WHERE status = 'pending'");

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general',
    link TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER NOT NULL,
    action TEXT NOT NULL,            -- e.g. 'user.suspend', 'user.reinstate', 'user.role_change', 'plan.create', 'plan.delete'
    target_type TEXT,                -- e.g. 'user', 'plan', 'group'
    target_id INTEGER,
    details TEXT,                    -- short human-readable summary, not raw JSON — shown directly in the admin UI
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (actor_id) REFERENCES users(id)
  );
`);

module.exports = db;
