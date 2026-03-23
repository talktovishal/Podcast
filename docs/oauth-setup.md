# OAuth Setup Guide (Google + Facebook + Apple)

This guide explains how to enable Google and Apple login for ArticlePod.

Current app callback paths:
- Google: `<APP_URL>/api/auth/google/callback`
- Facebook: `<APP_URL>/api/auth/facebook/callback`
- Apple: `<APP_URL>/api/auth/apple/callback`

With your default local `.env`, `APP_URL` is `http://localhost:3000`, so callbacks are:
- `http://localhost:3000/api/auth/google/callback`
- `http://localhost:3000/api/auth/facebook/callback`
- `http://localhost:3000/api/auth/apple/callback`

## 1) Environment Variables
Set these in `/Users/vishalchowdhary/Documents/Podcast/.env`:

```bash
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
FACEBOOK_APP_ID="..."
FACEBOOK_APP_SECRET="..."
APPLE_CLIENT_ID="..."
APPLE_CLIENT_SECRET="..."
```

Do not commit secrets. `.env` should stay local.

---

## 2) Google OAuth Setup

1. Open Google Cloud Console and create/select a project.
2. Configure OAuth consent screen:
- Go to Google Auth Platform.
- Fill Branding fields (app name, support email, developer email).
- Set Audience to `External` (unless you want internal Workspace-only access).
- Add your own Google account as a Test User.
3. Create OAuth Client:
- Type: `Web application`.
- Authorized redirect URI:
  - `http://localhost:3000/api/auth/google/callback` (or your actual `APP_URL` callback).
- Optional but recommended Authorized JavaScript origin:
  - `http://localhost:3000` (or your actual `APP_URL`).
4. Copy credentials:
- Client ID -> `GOOGLE_CLIENT_ID`
- Client Secret -> `GOOGLE_CLIENT_SECRET`
5. Restart app:
- `./run.sh`
6. Verify:
- Open `http://localhost:3000/api/auth/providers`
- Confirm `providers.google.configured` is `true`
- Login page should show Google button enabled.

---

## 3) Facebook Login Setup

1. Open the Meta app dashboard and create/select an app.
2. Add the `Facebook Login` product to the app.
3. In Facebook Login settings, add a Valid OAuth Redirect URI:
- `http://localhost:3000/api/auth/facebook/callback` (or your actual `APP_URL` callback).
4. Copy credentials:
- App ID -> `FACEBOOK_APP_ID`
- App Secret -> `FACEBOOK_APP_SECRET`
5. Restart app:
- `./run.sh`
6. Verify:
- Open `http://localhost:3000/api/auth/providers`
- Confirm `providers.facebook.configured` is `true`
- Login page should show Facebook button once configured.

---

## 4) Apple Sign in Setup

Important: Apple Sign in for web generally requires HTTPS and a real reachable domain. `localhost` often fails for Apple flows.

Recommended local-dev approach for Apple:
1. Run a secure tunnel (for example ngrok/Cloudflare Tunnel).
2. Set `APP_URL` to your HTTPS tunnel URL.
3. Use that same HTTPS callback in Apple configuration.

### Apple configuration steps
1. In Apple Developer account, create/select:
- An `App ID` with `Sign in with Apple` capability enabled.
2. Create a `Services ID` (this becomes `APPLE_CLIENT_ID`):
- Example format: `com.yourcompany.articlepod.web`
3. Configure Sign in with Apple for the Services ID:
- Add your domain/subdomain.
- Add Return URL:
  - `<APP_URL>/api/auth/apple/callback`
4. Create a `Sign in with Apple` key:
- Save Key ID (`kid`), Team ID (`iss`), and download `.p8` file.
5. Generate Apple client secret JWT (`APPLE_CLIENT_SECRET`) with ES256:
- Header: `alg=ES256`, `kid=<KEY_ID>`
- Claims:
  - `iss=<TEAM_ID>`
  - `sub=<APPLE_CLIENT_ID>` (Services ID)
  - `aud=https://appleid.apple.com`
  - `iat=<now>`
  - `exp=<now + <= 180 days>`

### Example Node command to generate `APPLE_CLIENT_SECRET`
Run this locally after exporting values:

```bash
export APPLE_TEAM_ID="..."
export APPLE_KEY_ID="..."
export APPLE_CLIENT_ID="com.yourcompany.articlepod.web"
export APPLE_P8_PATH="/absolute/path/AuthKey_XXXXXX.p8"

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
const signingInput = `${encodedHeader}.${encodedPayload}`;

const signature = crypto
  .createSign("SHA256")
  .update(signingInput)
  .end()
  .sign({ key: p8, dsaEncoding: "ieee-p1363" });

const jwt = `${signingInput}.${b64url(signature)}`;
console.log(jwt);
'
```

Copy printed JWT into `APPLE_CLIENT_SECRET`.

6. Restart app:
- `./run.sh`
7. Verify:
- Open `http://localhost:3000/api/auth/providers`
- Confirm `providers.apple.configured` is `true`
- Login page should show Apple button enabled.

---

## 5) Quick Verification Checklist

1. `GET /api/auth/providers` returns `configured: true` for providers you set.
2. Login page shows only the providers you configured.
3. Clicking provider starts redirect flow.
4. Callback lands on `/app` with session cookie set.

---

## 6) Common Errors

- `oauth_error=google_not_configured`
  - Missing/empty `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET`.
- `oauth_error=facebook_not_configured`
  - Missing/empty `FACEBOOK_APP_ID` or `FACEBOOK_APP_SECRET`.
- `oauth_error=apple_not_configured`
  - Missing/empty `APPLE_CLIENT_ID` or `APPLE_CLIENT_SECRET`.
- `oauth_error=google_state`, `oauth_error=facebook_state`, or `oauth_error=apple_state`
  - Callback URL mismatch, stale cookies, or restarted app mid-flow.
- `oauth_error=facebook_access_denied`
  - User canceled the Facebook consent screen or denied access.
- Apple callback/token errors on localhost
  - Use HTTPS `APP_URL` (tunnel) and update Apple return URL/domain config.
