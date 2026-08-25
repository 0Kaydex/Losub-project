# Losub pre-launch fixes — what changed and why

All of these were tested live (real server boot, real signup/login/plan/group/join flow,
real DB writes) before packaging, not just read through. See the earlier audit for how each
issue was originally found.

## 1. `group.html` was crashing for every member — FIXED
`html/group.html` was missing three elements (`soloPrice`, `miniYourPrice`, `miniSaved`)
that `js/group.js` required. That threw inside the page's main try/catch, so every member
landing on their group page saw "Couldn't load this group" instead of their actual group.
Added a "Your savings" panel with those three fields. Also removed a stray `</main>` with
no matching `<main>`, and a `<script src="../js/store.js">` tag pointing at a file that
doesn't exist in the project.

## 2. ₦100 wallet funding fee — IMPLEMENTED
`backend/routes/wallet.js`: `/api/wallet/fund/verify` now credits `amount - ₦100` instead
of the full amount, logged as two separate transactions (`fund` for the full amount,
`fund_fee` for -₦100) so the fee is visible and auditable in transaction history and the
admin transactions view. Amounts ≤ ₦100 are rejected with a clear error instead of crediting
₦0 or going negative. Frontend (`js/wallet.js`, `html/wallet.html`) now shows a live
"₦100 fee — you'll receive ₦X" preview as the user picks/types an amount, and the
minimum-amount validation matches the new backend rule.

## 3. Paystack funding — reconciliation safety net added (webhook)
New `backend/routes/webhooks.js`: `POST /api/webhooks/paystack`. Verifies Paystack's
HMAC-SHA512 signature, then credits the wallet on `charge.success` events — same fee logic
as `/fund/verify`, same idempotency check (skips if the reference was already processed).
This covers the case where a user pays but closes the tab before the frontend's
`/fund/verify` call completes; previously that money would be taken with nothing crediting
the wallet. Mounted in `server.js` with `express.raw()` **before** the global
`express.json()` middleware, since Paystack signs the raw body.
**You still need to**: switch `config.js`'s Paystack key from `pk_test_...` to your live
public key, set a live `PAYSTACK_SECRET_KEY`, and register
`https://api.losubapp.com/api/webhooks/paystack` as a webhook URL in your Paystack dashboard.

## 4. Manager access-link route — was a live 404, now works
`backend/routes/groups.js`: added `PUT /api/groups/:id/access-link` (manager-only, notifies
all other members when set/updated) and made `GET /api/groups/:id` actually return the
`accessLink` field — it was reading a column that existed in the DB but was never selected
or exposed. Tested live: manager sets a link, member's group page now receives it.

## 5. Owner dashboard health-check bug — FIXED
`js/owner-settings.js` referenced an undefined `API_ORIGIN` variable in the backend
health-check call (only `API_BASE` was defined in that file), so the check always silently
failed and showed "Backend unreachable" even when the backend was fine. One-line fix.

## 6. Dead code removed
`backend/routes/plans.js` had two `DELETE /:id` handlers — Express only ever wires up the
first one, so the second (more careful, with a "has N groups, remove them first" message)
was unreachable. Removed the dead one.

## 7. Mock admin pages labeled
`admin-messaging.html`, `admin-verification.html`, `admin-audit.html`,
`admin-reassignment.html` — these still use hardcoded in-memory data with no backend
(unchanged; wiring them up is a bigger job than a quick pass). Added a visible
"⚠️ Preview only — not connected to backend, nothing here is saved" banner on each page,
and a "(preview)" label on their sidebar links, so nobody on your team mistakes them for
live data on launch day.

## 8. `.env.example` + README fixed
Added `backend/.env.example` listing all 12 required env vars with comments on where each
comes from. Fixed the README, which referenced SendGrid — the code actually uses Resend.
Made explicit that the server **will not boot** without `JWT_SECRET` and `RESEND_API_KEY`
set, and that Fly.io needs these set via `fly secrets set`, not the `.env` file (which isn't
deployed).

---

## What I could NOT fix for you (need your input / your live credentials)
- **Live Paystack keys** — I can't generate these; swap them in per item 3 above.
- **VTPass / Google / Resend production keys** — same, need your real credentials.
- **Confirm Fly.io secrets are actually set** — I can't check your Fly.io deployment from
  here. Run `fly secrets list` (won't show values, just confirms which are set) and compare
  against `.env.example`.
- **A real Paystack sandbox/live test of the funding UI in an actual browser** — my sandbox
  can't reach `api.paystack.co` or the Google Sign-In domains, so those two flows are
  verified by careful code reading, not live execution. Please test both manually before
  launch.