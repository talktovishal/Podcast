# OAuth Setup Guide — Google & Apple Sign-In

Enable Google and/or Apple login for ArticlePod. Both providers are fully
implemented in the codebase and ready to go — you just need to register your app
with each provider and add credentials to your `.env` file.

> **Security note**: All OAuth credentials are read from environment variables at
> runtime. The `.env` file is git-ignored. **Never commit Client IDs, Client
> Secrets, private keys, or `.p8` files to source control.**

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Variables Overview](#2-environment-variables-overview)
3. [Google OAuth Setup (Step-by-Step)](#3-google-oauth-setup-step-by-step)
4. [Apple Sign-In Setup (Step-by-Step)](#4-apple-sign-in-setup-step-by-step)
5. [What Data Is Captured](#5-what-data-is-captured)
6. [Verification Checklist](#6-verification-checklist)
7. [Troubleshooting](#7-troubleshooting)
8. [Security Best Practices](#8-security-best-practices)

---

## 1) Prerequisites

| Item | Details |
|------|---------|
| Running app | `./run.sh` or `pnpm --filter @articlepod/web dev` |
| `APP_URL` | Defaults to `http://localhost:3000`. Set in `.env` if using a different host or tunnel. |
| Google Cloud account | Free — [console.cloud.google.com](https://console.cloud.google.com/) |
| Apple Developer account | Requires paid membership ($99/yr) — [developer.apple.com](https://developer.apple.com/) |

**Callback URLs** (register these with each provider):

| Provider | Callback URL |
|----------|-------------|
| Google | `<APP_URL>/api/auth/google/callback` |
| Apple | `<APP_URL>/api/auth/apple/callback` |

For local development the defaults are:
- `http://localhost:3000/api/auth/google/callback`
- `http://localhost:3000/api/auth/apple/callback`

---

## 2) Environment Variables Overview

Add these to your **`.env`** file (copy from `.env.simple.example` if starting
fresh). Only fill in the providers you want to enable — leaving a value empty
disables that provider.

```bash
# ── Google OAuth ─────────────────────────────────────────
GOOGLE_CLIENT_ID=""          # from Google Cloud Console
GOOGLE_CLIENT_SECRET=""      # from Google Cloud Console

# ── Apple Sign-In ────────────────────────────────────────
APPLE_CLIENT_ID=""           # your Services ID (e.g. com.yourco.articlepod.web)
APPLE_CLIENT_SECRET=""       # ES256-signed JWT (see Section 4)
```

> **Do not commit `.env`.** It is already listed in `.gitignore`.
> Never paste secrets into source files, PR descriptions, or logs.

---

## 3) Google OAuth Setup (Step-by-Step)

### 3a) Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Click the project dropdown at the top → **New Project**.
3. Name it (e.g. `ArticlePod`) and click **Create**.

### 3b) Configure the OAuth consent screen

1. In the left sidebar navigate to **APIs & Services → OAuth consent screen**
   (or search for "Google Auth Platform").
2. Fill in **Branding** fields:
   - **App name**: e.g. `ArticlePod`
   - **User support email**: your email
   - **Developer contact email**: your email
3. Under **Audience**, select **External** (allows any Google account to sign in).
4. Under **Test users**, add your own Google account email while the app is in
   "Testing" status. You can publish to production later to remove this
   restriction.
5. Click **Save**.

### 3c) Create OAuth 2.0 credentials

1. Go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: e.g. `ArticlePod Web`.
5. **Authorized JavaScript origins** (recommended):
   - `http://localhost:3000` (or your `APP_URL`).
6. **Authorized redirect URIs** (required):
   - `http://localhost:3000/api/auth/google/callback` (or `<APP_URL>/api/auth/google/callback`).
7. Click **Create**.
8. Copy the values shown:
   - **Client ID** → paste into `GOOGLE_CLIENT_ID` in `.env`
   - **Client Secret** → paste into `GOOGLE_CLIENT_SECRET` in `.env`

### 3d) Restart and verify

```bash
# Restart the app so it picks up the new env vars
./run.sh

# Quick check — should return {"providers":{"google":{"configured":true},...}}
curl http://localhost:3000/api/auth/providers
```

Open `http://localhost:3000/login` — the **Continue with Google** button should
now be active instead of showing "Google unavailable".

### What happens when a user signs in with Google

1. User clicks **Continue with Google** → redirected to Google consent screen.
2. Google redirects back to `/api/auth/google/callback` with an authorization code.
3. The app exchanges the code for an access token, then calls Google's userinfo
   endpoint (`openid email profile` scopes).
4. Captured data: **email** (only if verified), **full name** (with fallback to
   given + family name), **profile picture URL**, and **Google user ID**.
5. A session cookie is set and the user lands on `/app`.

---

## 4) Apple Sign-In Setup (Step-by-Step)

> **Important**: Apple Sign-In for web requires **HTTPS** and a publicly
> reachable domain. `http://localhost` will **not** work for the Apple callback.
>
> **Recommended for local dev**: Use a secure tunnel like
> [ngrok](https://ngrok.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
> and set `APP_URL` in `.env` to your HTTPS tunnel URL.

### 4a) Create an App ID

1. Go to [Apple Developer → Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources).
2. Under **Identifiers**, click **+** → select **App IDs** → Continue.
3. Platform: any. Description: e.g. `ArticlePod`.
4. Bundle ID (explicit): e.g. `com.yourcompany.articlepod`.
5. Under Capabilities, enable **Sign in with Apple** → Continue → Register.

### 4b) Create a Services ID

1. Under **Identifiers**, click **+** → select **Services IDs** → Continue.
2. Description: e.g. `ArticlePod Web`.
3. Identifier: e.g. `com.yourcompany.articlepod.web` — **this becomes your `APPLE_CLIENT_ID`**.
4. Register, then click on the newly created Services ID to configure it.
5. Enable **Sign in with Apple** → click **Configure**.
6. Primary App ID: select the App ID from step 4a.
7. **Domains and Subdomains**: add your domain (e.g. `your-tunnel.ngrok.io` or
   your production domain).
8. **Return URLs**: add `<APP_URL>/api/auth/apple/callback`
   (e.g. `https://your-tunnel.ngrok.io/api/auth/apple/callback`).
9. Save.

### 4c) Create a Sign-In key

1. Under **Keys**, click **+**.
2. Name: e.g. `ArticlePod Sign-In`.
3. Enable **Sign in with Apple** → Configure → select your primary App ID → Save.
4. Click **Continue → Register**.
5. **Download the `.p8` file** — you will only get one chance. Store it securely
   and **never commit it**.
6. Note the **Key ID** shown on the page.
7. Note your **Team ID** (visible at the top-right of the developer portal, or
   under Membership).

### 4d) Generate the Apple client secret JWT

Apple's client secret is a short-lived ES256 JWT you generate yourself using
your `.p8` key. It expires after at most 180 days, after which you regenerate it.

Run this command locally (not in source control):

```bash
export APPLE_TEAM_ID="YOUR_TEAM_ID"
export APPLE_KEY_ID="YOUR_KEY_ID"
export APPLE_CLIENT_ID="com.yourcompany.articlepod.web"
export APPLE_P8_PATH="/absolute/path/to/AuthKey_XXXXXX.p8"

node -e '
const fs = require("fs");
const crypto = require("crypto");

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

const teamId = process.env.APPLE_TEAM_ID;
const keyId = process.env.APPLE_KEY_ID;
const clientId = process.env.APPLE_CLIENT_ID;
const p8 = fs.readFileSync(process.env.APPLE_P8_PATH, "utf8");

const now = Math.floor(Date.now() / 1000);
const payload = {
  iss: teamId,
  iat: now,
  exp: now + 60 * 60 * 24 * 180,
  aud: "https://appleid.apple.com",
  sub: clientId
};

const header = { alg: "ES256", kid: keyId, typ: "JWT" };
const encodedHeader = b64url(JSON.stringify(header));
const encodedPayload = b64url(JSON.stringify(payload));
const signingInput = encodedHeader + "." + encodedPayload;

const signature = crypto
  .createSign("SHA256")
  .update(signingInput)
  .end()
  .sign({ key: p8, dsaEncoding: "ieee-p1363" });

const jwt = signingInput + "." + b64url(signature);
console.log(jwt);
'
```

Copy the printed JWT into `APPLE_CLIENT_SECRET` in your `.env`.

> **Reminder**: This JWT expires after 180 days. Set a calendar reminder to
> regenerate it before expiry.

### 4e) Restart and verify

```bash
./run.sh
curl http://localhost:3000/api/auth/providers
# Should show: {"providers":{"apple":{"configured":true},...}}
```

Open `http://localhost:3000/login` — the **Continue with Apple** button should
now be active.

### What happens when a user signs in with Apple

1. User clicks **Continue with Apple** → redirected to Apple's consent page.
2. Apple redirects back to `/api/auth/apple/callback` with an authorization code.
3. The app exchanges the code for an ID token (JWT).
4. Captured data: **email** (only if verified by Apple), **name** (first + last,
   sent only on first authorization), and **Apple user ID**.
5. A session cookie is set and the user lands on `/app`.

> **Note**: Apple only sends the user's name on the **first** authorization.
> If the user revokes and re-authorizes, the name is sent again. On repeat
> logins, only email and user ID are available.

---

## 5) What Data Is Captured

The app does **not** store passwords for OAuth users. When a user signs in via
Google or Apple, the following data is captured:

| Field | Google | Apple | Stored in |
|-------|--------|-------|-----------|
| Email | ✅ (verified only) | ✅ (verified only) | `User.email` |
| Full name | ✅ (every login) | ✅ (first login only) | `User.name` |
| Profile picture | ✅ (every login) | ❌ (not provided) | `User.pictureUrl` |
| Provider user ID | ✅ | ✅ | `OAuthIdentity.providerUserId` |
| Provider name | `"google"` | `"apple"` | `OAuthIdentity.provider` |
| Email at link time | ✅ | ✅ | `OAuthIdentity.emailAtLink` |

**No passwords are stored or managed for OAuth users.** The `User.passwordHash`
field remains `NULL` for accounts created through Google or Apple sign-in.

If a user later signs in with a different provider using the same verified email,
the providers are linked to the same user account automatically.

---

## 6) Verification Checklist

After setup, confirm each step:

- [ ] `GET /api/auth/providers` returns `"configured": true` for each enabled provider
- [ ] Login page shows **Continue with Google** / **Continue with Apple** (not "unavailable")
- [ ] Clicking the button redirects to the provider's consent screen
- [ ] After consent, the callback redirects to `/app` with a session cookie
- [ ] Dashboard header shows the user's name (and profile picture for Google)
- [ ] `User` record in the database has `email`, `name`, and (for Google) `pictureUrl`
- [ ] `OAuthIdentity` record links the user to the provider
- [ ] `.env` file is **not** committed (check `git status`)

---

## 7) Troubleshooting

| Error code | Cause | Fix |
|-----------|-------|-----|
| `oauth_error=google_not_configured` | `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is empty | Add both values to `.env` and restart |
| `oauth_error=apple_not_configured` | `APPLE_CLIENT_ID` or `APPLE_CLIENT_SECRET` is empty | Add both values to `.env` and restart |
| `oauth_error=google_state` | State cookie mismatch | Clear cookies, ensure redirect URI in Google Console matches `APP_URL` exactly |
| `oauth_error=apple_state` | State cookie mismatch | Clear cookies, ensure Return URL in Apple Console matches `APP_URL` exactly |
| `oauth_error=google_token` | Code exchange failed | Verify `GOOGLE_CLIENT_SECRET` is correct, redirect URI matches |
| `oauth_error=apple_token` | Code exchange failed | Verify `APPLE_CLIENT_SECRET` JWT is not expired, `APPLE_CLIENT_ID` matches Services ID |
| `oauth_error=apple_id_token` | No id_token in Apple response | Check Apple key configuration and client secret JWT |
| `oauth_error=google_profile` | Google userinfo call failed | Check network; possibly rate limited |
| Apple flow fails on localhost | Apple requires HTTPS | Use an HTTPS tunnel (ngrok, Cloudflare Tunnel) and set `APP_URL` accordingly |

---

## 8) Security Best Practices

1. **Never commit secrets.** `.env`, `.p8` files, and any file matching
   `.secrets-*` are git-ignored. Double-check with `git status` before pushing.

2. **Rotate Apple client secret before expiry.** The JWT generated in step 4d
   lasts at most 180 days. Regenerate it and update `.env` before it expires.

3. **Restrict Google OAuth origins.** In Google Cloud Console, add only the
   domains you actually use as Authorized JavaScript Origins and Redirect URIs.

4. **Use HTTPS in production.** Both providers require HTTPS for production
   deployments. `APP_URL` should be `https://your-domain.com`.

5. **Review test users.** While your Google OAuth consent screen is in "Testing"
   mode, only accounts listed as test users can sign in. Publish to production
   when ready to open access.

6. **Store the Apple `.p8` key securely.** It cannot be re-downloaded. Keep a
   backup in a password manager or encrypted storage, never in your repo.

7. **Verified emails only.** The app only uses emails that the provider has
   confirmed as verified. Unverified emails from Google (`email_verified=false`)
   or Apple are not used for account linking.
