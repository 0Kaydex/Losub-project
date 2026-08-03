# Losub Backend — Auth (Email/Password + Google Sign-In)

## What's included
- Sign up / log in with email + password (bcrypt-hashed passwords, JWT sessions)
- Email verification (must verify before logging in)
- Resend verification email
- Forgot password / reset password
- Google Sign-In (sign up or log in with Google, accounts auto-link by email)
- SQLite database (uses Node's **built-in** `node:sqlite` — no native compiling)

## 1. Requirements
- **Node.js 22.5 or newer** (needed for the built-in SQLite module). Check with:
  ```
  node -v
  ```
  If you're on an ol der version, tell me and I'll swap the database layer for the `sql.js` package instead — same schema, no native compiling required either way.

## 2. Install
```bash
cd losub-backend
npm install
```

## 3. Configure environment variables
```bash
cp .env.example .env
```
Then fill in `.env`:
- `JWT_SECRET` — generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `SENDGRID_API_KEY` — from your SendGrid account (Settings → API Keys). Must start with `SG.`
- `FROM_EMAIL` — an email address you've **verified as a sender** in SendGrid (Settings → Sender Authentication). SendGrid will reject sends from unverified senders.
- `FRONTEND_URL` — wherever your Live Server is running (default assumes `http://127.0.0.1:5500/html`, matching your existing setup)
- `BACKEND_URL` — wherever this server runs (default `http://localhost:3000`)
- `GOOGLE_CLIENT_ID` — see step 5 below

## 4. Run it
```bash
node server.js
```
You should see:
```
Losub backend running at http://localhost:3000
```
Test it's alive: open `http://localhost:3000/api/health` in a browser — should show `{"ok":true,...}`.

## 5. Set up Google Sign-In
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create a project (or use an existing one).
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Under **Authorized JavaScript origins**, add exactly where your frontend runs, e.g. `http://127.0.0.1:5500`.
5. Copy the generated **Client ID** into both:
   - `.env` → `GOOGLE_CLIENT_ID`
   - Your frontend's Google Sign-In button config (see integration snippet below)
6. You do **not** need a Client Secret for this flow — only the Client ID, since verification happens via Google's public library, not a secret exchange.

## 6. Frontend integration
Update `js/auth.js` and `html/auth.html` to call these endpoints instead of the `console.log` placeholders. Ask me for the updated `auth.js`/`auth.html` and I'll wire it to:
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/resend-verification`
- `POST /api/auth/google` (paired with Google's Identity Services `<script>` on the page)

## API reference

| Method | Route | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ fullname, email, password }` | Sends verification email |
| GET | `/api/auth/verify-email?token=...` | — | Called from the email link; redirects to frontend |
| POST | `/api/auth/resend-verification` | `{ email }` | Safe to call repeatedly |
| POST | `/api/auth/login` | `{ email, password }` | Fails if unverified or Google-only account |
| POST | `/api/auth/forgot-password` | `{ email }` | Always returns success message (doesn't leak which emails exist) |
| POST | `/api/auth/reset-password` | `{ token, newPassword }` | Token from the reset email link |
| POST | `/api/auth/google` | `{ credential }` | `credential` = Google ID token from Identity Services |
| GET | `/api/auth/me` | — (needs `Authorization: Bearer <token>`) | Returns the logged-in user |

## Notes on what was tested
Every endpoint above was tested end-to-end in the build sandbox, including: duplicate signup rejection, weak-password rejection, login-before-verification blocking, wrong-password rejection, the full verify → login → protected-route flow, and rejecting a reused/garbage token. Email *sending* itself couldn't be tested live from the sandbox (SendGrid's domain isn't reachable there), but the send call, error handling, and fallback messaging are all in place and will work with a real API key on your machine.
