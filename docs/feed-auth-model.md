# Feed Auth Model

This document explains the private-feed auth model in plain language and records the invariants we must preserve.

## Plain-English mental model

ArticlePod does not publish a public podcast feed. It publishes a private, per-user feed.

Podcast apps such as Apple Podcasts and YouTube Music do not sign into ArticlePod with cookies or headers. They only know how to fetch URLs. That means the URL itself acts as the credential.

There are two separate private resources:

1. The RSS feed itself
- Example shape: `/rss/<feed_token>.xml`
- Purpose: identifies and authorizes access to one user's private podcast feed

2. The episode media URLs inside the RSS feed
- Example shape: `/api/media/...?...auth...`
- Purpose: authorizes access to the MP3 bytes for a specific episode

From the podcast app's point of view, both the feed URL and the episode enclosure URLs must stay stable during normal day-to-day usage.

## Token types

### Web session cookie
- Used by: logged-in browser sessions
- Surface: website only
- Expected lifetime: normal session TTL
- Rotation trigger: login/logout/session expiry
- Podcast app impact: none

### Feed token
- Used by: the main private RSS feed
- Surface: `/rss/<feed_token>.xml`
- Expected lifetime: long-lived until the user explicitly rotates it
- Rotation trigger: explicit user request only
- Podcast app impact: rotating it invalidates the old RSS URL

### Digest feed token
- Used by: the digest RSS feed
- Surface: `/rss/digest/<digest_feed_token>.xml`
- Expected lifetime: long-lived until the user explicitly rotates it
- Rotation trigger: explicit user request only
- Podcast app impact: rotating it invalidates the old digest RSS URL

### Media auth token
- Used by: episode enclosure/media URLs returned inside RSS
- Surface: media route query params
- Expected lifetime: stable for a given episode until the owning feed token is rotated
- Rotation trigger: explicit feed-token rotation or explicit episode/media regeneration that changes the underlying object key
- Podcast app impact: during normal refreshes, enclosure URLs must not churn

### Extension connect code
- Used by: one-time Chrome extension pairing
- Surface: connect-code exchange flow
- Expected lifetime: short-lived
- Rotation trigger: each new connect-code request
- Podcast app impact: none

### Extension token
- Used by: installed Chrome extension after pairing
- Surface: extension API bearer token
- Expected lifetime: long-lived
- Rotation trigger: explicit revoke or expiry
- Podcast app impact: none

### Share token
- Used by: read-only shared workspace links
- Surface: `/share?token=...`
- Expected lifetime: revocable / expirable by product policy
- Rotation trigger: explicit share-link creation/revocation
- Podcast app impact: none

## Privacy and security goals

Why do we use tokens at all?

- The feed contains private, user-specific content.
- The episode audio is private and should not become a permanently public static file.
- Podcast apps cannot present normal interactive auth.

So the URL becomes a bearer secret. Anyone who has the exact private URL can fetch it, which means:

- tokens must be hard to guess
- tokens must never be logged in plaintext
- tokens must not leak into user-visible errors
- rotation must be possible when a user wants to revoke old access

## Stability rules (non-negotiable)

These are the key rules we must not violate again.

### Rules visible to podcast apps

During normal usage, the following must stay stable:

- the user's feed URL
- the user's digest feed URL
- existing episode enclosure URLs for unchanged episodes

### Only these actions may change externally visible podcast auth

1. First-time token creation for a user who does not yet have a feed token
2. Explicit user-initiated rotation
3. Explicit revoke/delete flows
4. Intentional episode/media regeneration that truly replaces the published media object

### These actions must never change podcast auth

- opening `/app`
- opening `/app/settings`
- background workspace refresh/polling
- reconnecting via OAuth for an existing account
- reading dashboard state
- repairing internal metadata drift
- re-rendering RSS without content/auth changes

## Internal repairs vs. external auth changes

An internal repair is allowed only when the public URL does not change.

Example:
- if stored metadata drifted so the saved hash no longer matches the same already-issued plaintext feed token, the server may repair the stored hash in place
- this is acceptable because the user's actual feed URL is unchanged

What is not acceptable:
- deactivating the old active feed token and issuing a new one just because the dashboard cannot currently display the old plaintext value

That breaks existing podcast subscriptions.

## Failure modes we saw in production

These are the mistakes this document exists to prevent.

### Mistake 1: per-request enclosure URL churn
- Same episode audio got a different signed URL on repeated RSS fetches
- Podcast apps cached old URLs and later reported playback failures

### Mistake 2: silent feed-token rotation from read paths
- A dashboard/settings/auth path requested a displayable plaintext token
- The code replaced an existing active hash-only token with a new token
- Existing podcast apps kept polling the old URL and got `404`

### Mistake 3: stored hash/value drift
- The stored hash and stored plaintext token became inconsistent during storage migration/cutover work
- The feed looked valid in settings but failed on the RSS route until the server repaired the stored hash

## Design rules for future changes

If you touch feed/media auth, do all of the following:

1. Preserve podcast-app stability first
- Treat the podcast app as a dumb cache-heavy client
- Assume it may keep old URLs for a long time

2. Prefer compatibility over clever security churn
- A long-lived revocable token is better than a frequently changing token that breaks clients

3. Never rotate because a read path wants convenience
- Display problems must not become auth mutations

4. Keep media auth deterministic
- If the episode, path, and active feed token are unchanged, the enclosure URL should also be unchanged

5. When repairing metadata, keep the public URL the same
- Repair stored internals in place instead of issuing a new public URL

## Required regression checks for auth changes

Any code change that touches feed/media auth must prove all of these:

1. Repeated RSS fetches for unchanged episodes produce the same enclosure URLs
2. Opening dashboard/settings does not rotate feed tokens
3. Existing OAuth login/callback flows do not rotate feed tokens
4. Background refresh routes do not rotate feed tokens
5. Explicit rotate routes still issue a new token and invalidate the old one
6. Podcast contract still passes (`HEAD` + `Range`)

## Current intended behavior summary

As of the current implementation:

- Feed URL: stable until explicit user rotation
- Digest feed URL: stable until explicit user rotation
- Media/enclosure URLs: stable until feed rotation for unchanged episodes
- Extension connect code: short-lived and one-time
- Extension installed token: long-lived

If this document and the code ever disagree, treat the disagreement as a release blocker for any feed/media auth work.
