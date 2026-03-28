import { AUTH_COOKIE_NAMES, computeNextDailyRunAt, computeNextWeeklyRunAt, createSecretToken, hashIncomingToken } from "@articlepod/core";
import bcrypt from "bcryptjs";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import type { AnalyticsAuthMethod } from "@articlepod/core";
import { recordAnalyticsEventBestEffort, resolveUserAnalyticsProfile } from "./admin-analytics/events";
import { env } from "./env";
import { resolveGeoSnapshotFromHeaders } from "./geo";
import type { OAuthProvider } from "./oauth-providers";
import {
  createPrimaryExtensionConnectCode,
  createPrimaryExtensionToken,
  createPrimaryFeedToken,
  deletePrimaryShareTokensByUserIdAndScope,
  type PrimaryFeedTokenRecord,
  type PrimaryShareTokenRecord,
  createPrimarySession,
  createPrimaryShareToken,
  createPrimaryOAuthIdentity,
  createPrimaryUser,
  deactivatePrimaryFeedTokens,
  deletePrimarySessionByTokenHash,
  findPrimaryActiveFeedTokenByUserId,
  findPrimaryDigestSettingsByUserId,
  findPrimaryExtensionConnectCodeWithUserByHash,
  findPrimaryExtensionTokenWithUserByHash,
  findPrimaryOAuthIdentityWithUser,
  findPrimaryShareTokenByUserIdAndScope,
  findPrimaryShareTokenWithUserByHash,
  findPrimarySessionWithUserByTokenHash,
  findPrimaryUserByEmail,
  findPrimaryUserByFeedTokenHash,
  findPrimaryUserById,
  findPrimaryUserByShareTokenHash,
  revokePrimaryExtensionTokensForUser,
  touchPrimaryExtensionTokenLastUsed,
  updatePrimaryUser,
  upsertPrimaryDigestSettings,
  consumePrimaryExtensionConnectCode
} from "./metadata-primary-auth";
import { buildPublicEpisodeShareScope, buildPublicEpisodeShareUrl, isExpiredShare } from "./share-links";

const SESSION_COOKIE = AUTH_COOKIE_NAMES.session;
const LEGACY_SESSION_COOKIE = AUTH_COOKIE_NAMES.legacySession;
const OAUTH_STATE_COOKIE_PREFIX = AUTH_COOKIE_NAMES.oauthPrefix;
const LEGACY_OAUTH_STATE_COOKIE_PREFIX = AUTH_COOKIE_NAMES.legacyOauthPrefix;
const EXTENSION_CONNECT_CODE_TTL_MINUTES = Number(process.env.EXTENSION_CONNECT_CODE_TTL_MINUTES ?? 24 * 60);
const OAUTH_PLACEHOLDER_DOMAIN = "oauth.articlepod.local";

export type FeedTokenAccess = Pick<PrimaryFeedTokenRecord, "tokenHash" | "tokenValue">;

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
};

function normalizeRole(role: string): "USER" | "ADMIN" {
  if (role !== "USER" && role !== "ADMIN") {
    throw new Error(`Unknown role value in database: "${role}". Expected USER or ADMIN.`);
  }
  return role;
}

function authUserFromDbUser(user: { id: string; email: string; name: string | null; role: string }): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: normalizeRole(user.role)
  };
}

function sessionExpiryDate(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + env.sessionTtlDays);
  return expires;
}

function extensionConnectCodeExpiryDate(): Date {
  return new Date(Date.now() + EXTENSION_CONNECT_CODE_TTL_MINUTES * 60_000);
}

function extensionTokenExpiryDate(): null {
  return null;
}

function oauthStateCookieName(prefix: string, provider: OAuthProvider): string {
  return `${prefix}_${provider}`;
}

function sessionTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? request.cookies.get(LEGACY_SESSION_COOKIE)?.value ?? null;
}

async function sessionTokenFromCookieStore(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? cookieStore.get(LEGACY_SESSION_COOKIE)?.value ?? null;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export async function verifyAppleIdToken(
  idToken: string,
  clientId: string
): Promise<Record<string, unknown>> {
  const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: clientId
  });
  return payload as Record<string, unknown>;
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

async function ensureUserFeedTokenAccessRecord(userId: string, kind: "item" | "digest"): Promise<FeedTokenAccess> {
  const active = await findPrimaryActiveFeedTokenByUserId(userId, kind);
  if (active) {
    return {
      tokenHash: active.tokenHash,
      tokenValue: active.tokenValue
    };
  }

  const token = createSecretToken();
  await createPrimaryFeedToken({
    userId,
    tokenHash: token.hash,
    tokenValue: token.plain,
    kind
  });

  return {
    tokenHash: token.hash,
    tokenValue: token.plain
  };
}

export async function ensureUserFeedTokenAccess(userId: string): Promise<FeedTokenAccess> {
  return ensureUserFeedTokenAccessRecord(userId, "item");
}

export async function ensureUserFeedToken(userId: string): Promise<string> {
  const active = await ensureUserFeedTokenAccess(userId);
  if (!active.tokenValue) {
    throw new Error("Active item feed token exists, but its private URL is not displayable. Rotate it explicitly to generate a new URL.");
  }
  return active.tokenValue;
}

export async function ensureUserDigestFeedTokenAccess(userId: string): Promise<FeedTokenAccess> {
  return ensureUserFeedTokenAccessRecord(userId, "digest");
}

export async function ensureUserDigestFeedToken(userId: string): Promise<string> {
  const active = await ensureUserDigestFeedTokenAccess(userId);
  if (!active.tokenValue) {
    throw new Error("Active digest feed token exists, but its private URL is not displayable. Rotate it explicitly to generate a new URL.");
  }
  return active.tokenValue;
}

export async function ensureUserDigestSettings(userId: string) {
  const existing = await findPrimaryDigestSettingsByUserId(userId);
  if (existing) {
    return existing;
  }

  const now = new Date();
  const timezone = "UTC";
  return upsertPrimaryDigestSettings({
    userId,
    timezone,
    dailyEmailEnabled: false,
    dailyPodcastEnabled: false,
    dailyHour: 16,
    dailyMinute: 0,
    dailyLengthMinutes: 5,
    dailyNextRunAt: computeNextDailyRunAt({
      now,
      timezone,
      dailyHour: 16,
      dailyMinute: 0
    }),
    weeklyEmailEnabled: true,
    weeklyPodcastEnabled: true,
    weeklyDayOfWeek: 5,
    weeklyHour: 16,
    weeklyMinute: 0,
    weeklyLengthMinutes: 15,
    weeklyNextRunAt: computeNextWeeklyRunAt({
      now,
      timezone,
      weeklyDayOfWeek: 5,
      weeklyHour: 16,
      weeklyMinute: 0
    })
  });
}

export async function updateUserGeoSnapshotFromRequest(userId: string, request: NextRequest): Promise<void> {
  const geo = resolveGeoSnapshotFromHeaders(request.headers);
  const now = new Date();

  const existing = await findPrimaryUserById(userId);
  if (!existing) {
    return;
  }

  const updateData: {
    firstSeenAt?: Date;
    firstSeenCountryCode?: string;
    firstSeenRegionCode?: string;
    firstSeenCity?: string;
    lastSeenAt: Date;
    lastSeenCountryCode?: string;
    lastSeenRegionCode?: string;
    lastSeenCity?: string;
  } = {
    lastSeenAt: now
  };

  if (!existing.firstSeenAt) {
    updateData.firstSeenAt = now;
  }
  if (!existing.firstSeenCountryCode && geo.countryCode) {
    updateData.firstSeenCountryCode = geo.countryCode;
  }
  if (!existing.firstSeenRegionCode && geo.regionCode) {
    updateData.firstSeenRegionCode = geo.regionCode;
  }
  if (!existing.firstSeenCity && geo.city) {
    updateData.firstSeenCity = geo.city;
  }

  if (geo.countryCode) {
    updateData.lastSeenCountryCode = geo.countryCode;
  }
  if (geo.regionCode) {
    updateData.lastSeenRegionCode = geo.regionCode;
  }
  if (geo.city) {
    updateData.lastSeenCity = geo.city;
  }

  await updatePrimaryUser(userId, updateData);
}

export async function createSession(
  userId: string,
  options?: {
    authMethod?: AnalyticsAuthMethod;
  }
): Promise<string> {
  const token = createSecretToken();
  const session = await createPrimarySession({
    userId,
    tokenHash: token.hash,
    expiresAt: sessionExpiryDate()
  });
  const profile = await resolveUserAnalyticsProfile(userId);
  await recordAnalyticsEventBestEffort({
    eventType: "USER_LOGIN",
    userId,
    dedupeKey: `user_login:session:${session.id}`,
    authMethod: options?.authMethod ?? profile.authMethod,
    segmentAuth: profile.segmentAuth,
    userRole: profile.userRole,
    occurredAt: session.createdAt,
    metadata: {
      session_id: session.id
    }
  });
  return token.plain;
}

export async function setSessionCookie(response: NextResponse, token: string): Promise<void> {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: env.runtimeProfile !== "simple",
    path: "/",
    expires: sessionExpiryDate()
  });
}

export function clearSessionCookie(response: NextResponse): void {
  const expiredCookie = {
    value: "",
    expires: new Date(0),
    path: "/"
  } as const;

  response.cookies.set({
    name: SESSION_COOKIE,
    ...expiredCookie
  });
  response.cookies.set({
    name: LEGACY_SESSION_COOKIE,
    ...expiredCookie
  });
}

export async function getAuthUserFromRequest(request: NextRequest): Promise<AuthUser | null> {
  const token = sessionTokenFromRequest(request);
  if (!token) {
    return null;
  }

  return getAuthUserFromToken(token);
}

export async function getAuthUserFromCookies(): Promise<AuthUser | null> {
  const token = await sessionTokenFromCookieStore();
  if (!token) {
    return null;
  }

  return getAuthUserFromToken(token);
}

async function getAuthUserFromToken(token: string): Promise<AuthUser | null> {
  const tokenHash = hashIncomingToken(token);
  const session = await findPrimarySessionWithUserByTokenHash(tokenHash);

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() < Date.now()) {
    await deletePrimarySessionByTokenHash(tokenHash);
    return null;
  }

  return authUserFromDbUser(session.user);
}

export async function requireAuthUser(request: NextRequest): Promise<AuthUser> {
  const user = await getAuthUserFromRequest(request);
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function rotateFeedToken(userId: string): Promise<string> {
  await deactivatePrimaryFeedTokens(userId, "item", new Date());

  const token = createSecretToken();
  await createPrimaryFeedToken({
    userId,
    tokenHash: token.hash,
    tokenValue: token.plain,
    kind: "item"
  });

  return token.plain;
}

export async function rotateDigestFeedToken(userId: string): Promise<string> {
  await deactivatePrimaryFeedTokens(userId, "digest", new Date());

  const token = createSecretToken();
  await createPrimaryFeedToken({
    userId,
    tokenHash: token.hash,
    tokenValue: token.plain,
    kind: "digest"
  });

  return token.plain;
}

export async function createShareToken(userId: string, expiresAt?: Date): Promise<string> {
  const token = createSecretToken();
  await createPrimaryShareToken({
    userId,
    tokenHash: token.hash,
    expiresAt
  });

  return token.plain;
}

export async function ensurePublicEpisodeShareLink(
  userId: string,
  itemId: string
): Promise<{ share: PrimaryShareTokenRecord; shareUrl: string; created: boolean }> {
  const scope = buildPublicEpisodeShareScope(itemId);
  const existing = await findPrimaryShareTokenByUserIdAndScope(userId, scope);
  if (existing && !isExpiredShare(existing)) {
    return {
      share: existing,
      shareUrl: buildPublicEpisodeShareUrl(existing),
      created: false
    };
  }

  if (existing) {
    await deletePrimaryShareTokensByUserIdAndScope(userId, scope);
  }

  const token = createSecretToken();
  const share = await createPrimaryShareToken({
    userId,
    tokenHash: token.hash,
    scope
  });

  return {
    share,
    shareUrl: buildPublicEpisodeShareUrl(share),
    created: true
  };
}

export async function revokePublicEpisodeShareLink(userId: string, itemId: string): Promise<number> {
  return deletePrimaryShareTokensByUserIdAndScope(userId, buildPublicEpisodeShareScope(itemId));
}

export async function getUserByShareToken(plain: string): Promise<AuthUser | null> {
  const tokenHash = hashIncomingToken(plain);
  const share = await findPrimaryShareTokenWithUserByHash(tokenHash);
  if (!share) {
    return null;
  }

  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return authUserFromDbUser(share.user);
}

export async function getUserByFeedToken(plain: string): Promise<AuthUser | null> {
  const tokenHash = hashIncomingToken(plain);
  const user = await findPrimaryUserByFeedTokenHash(tokenHash, "item");
  if (!user) {
    return null;
  }

  return authUserFromDbUser(user);
}

export async function getUserByDigestFeedToken(plain: string): Promise<AuthUser | null> {
  const tokenHash = hashIncomingToken(plain);
  const user = await findPrimaryUserByFeedTokenHash(tokenHash, "digest");
  if (!user) {
    return null;
  }

  return authUserFromDbUser(user);
}

export function setOAuthStateCookie(response: NextResponse, provider: OAuthProvider, state: string): void {
  response.cookies.set({
    name: oauthStateCookieName(OAUTH_STATE_COOKIE_PREFIX, provider),
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: env.runtimeProfile !== "simple",
    path: "/",
    maxAge: 60 * 10
  });
}

export function getOAuthStateFromRequest(request: NextRequest, provider: OAuthProvider): string | null {
  return (
    request.cookies.get(oauthStateCookieName(OAUTH_STATE_COOKIE_PREFIX, provider))?.value ??
    request.cookies.get(oauthStateCookieName(LEGACY_OAUTH_STATE_COOKIE_PREFIX, provider))?.value ??
    null
  );
}

export function clearOAuthStateCookie(response: NextResponse, provider: OAuthProvider): void {
  const expiredCookie = {
    value: "",
    expires: new Date(0),
    path: "/"
  } as const;

  response.cookies.set({
    name: oauthStateCookieName(OAUTH_STATE_COOKIE_PREFIX, provider),
    ...expiredCookie
  });
  response.cookies.set({
    name: oauthStateCookieName(LEGACY_OAUTH_STATE_COOKIE_PREFIX, provider),
    ...expiredCookie
  });
}

export function isOAuthProviderConfigured(provider: OAuthProvider): boolean {
  if (provider === "google") {
    return Boolean(env.googleClientId && env.googleClientSecret);
  }
  if (provider === "facebook") {
    return Boolean(env.facebookAppId && env.facebookAppSecret);
  }

  return Boolean(env.appleClientId && env.appleClientSecret);
}

function normalizeOAuthEmail(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return null;
  }
  return normalized;
}

function fallbackOAuthEmail(provider: OAuthProvider, providerUserId: string): string {
  return `${provider}-${providerUserId}@${OAUTH_PLACEHOLDER_DOMAIN}`;
}

export async function findOrCreateOAuthUser(input: {
  provider: OAuthProvider;
  providerUserId: string;
  email?: string | null;
  name?: string | null;
}): Promise<{ user: { id: string; email: string; name: string | null; role: string }; created: boolean }> {
  const normalizedEmail = normalizeOAuthEmail(input.email);
  const existingIdentity = await findPrimaryOAuthIdentityWithUser(input.provider, input.providerUserId);

  if (existingIdentity) {
    const updateData: { name?: string; email?: string } = {};
    if (input.name?.trim()) {
      updateData.name = input.name.trim();
    }
    if (normalizedEmail && existingIdentity.user.email.endsWith(`@${OAUTH_PLACEHOLDER_DOMAIN}`)) {
      updateData.email = normalizedEmail;
    }

    const user =
      Object.keys(updateData).length > 0 ? await updatePrimaryUser(existingIdentity.userId, updateData) : existingIdentity.user;
    return {
      user: {
        id: user?.id ?? existingIdentity.user.id,
        email: user?.email ?? existingIdentity.user.email,
        name: user?.name ?? existingIdentity.user.name,
        role: user?.role ?? existingIdentity.user.role
      },
      created: false
    };
  }

  const userByEmail = normalizedEmail ? await findPrimaryUserByEmail(normalizedEmail) : null;
  const user =
    userByEmail ??
    (await createPrimaryUser({
      email: normalizedEmail ?? fallbackOAuthEmail(input.provider, input.providerUserId),
      name: input.name?.trim() || null,
      role: "USER"
    }));

  await createPrimaryOAuthIdentity({
    userId: user.id,
    provider: input.provider,
    providerUserId: input.providerUserId,
    emailAtLink: normalizedEmail
  });

  return {
    user,
    created: !userByEmail
  };
}

function getBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function getAuthUserFromExtensionTokenRequest(request: NextRequest): Promise<AuthUser | null> {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const tokenHash = hashIncomingToken(token);
  const extensionToken = await findPrimaryExtensionTokenWithUserByHash(tokenHash);

  if (!extensionToken || extensionToken.revokedAt) {
    return null;
  }

  void touchPrimaryExtensionTokenLastUsed(tokenHash, new Date())
    .catch(() => {
      // Best-effort usage tracking.
    });

  return authUserFromDbUser(extensionToken.user);
}

export async function createExtensionConnectCodeForUser(
  userId: string,
  label?: string
): Promise<{ connectCode: string; expiresAt: Date }> {
  const code = createSecretToken();
  const expiresAt = extensionConnectCodeExpiryDate();

  await createPrimaryExtensionConnectCode({
    userId,
    codeHash: code.hash,
    label: label?.trim() || null,
    expiresAt
  });

  return { connectCode: code.plain, expiresAt };
}

export async function exchangeExtensionConnectCode(input: {
  connectCode: string;
  label?: string;
}): Promise<{ token: string; expiresAt: Date | null; user: AuthUser }> {
  const codeHash = hashIncomingToken(input.connectCode);
  const now = new Date();
  const connectCode = await findPrimaryExtensionConnectCodeWithUserByHash(codeHash);
  if (!connectCode || connectCode.consumedAt || connectCode.expiresAt.getTime() < now.getTime()) {
    throw new Error("INVALID_CONNECT_CODE");
  }

  const consumed = await consumePrimaryExtensionConnectCode(codeHash, now);
  if (!consumed) {
    throw new Error("INVALID_CONNECT_CODE");
  }

  const token = createSecretToken();
  const expiresAt = extensionTokenExpiryDate();
  await createPrimaryExtensionToken({
    userId: connectCode.userId,
    tokenHash: token.hash,
    label: input.label?.trim() || connectCode.label || "chrome-extension",
    scope: "ingest:html_snapshot",
    expiresAt
  });

  const result = {
    token: token.plain,
    expiresAt,
    user: authUserFromDbUser(connectCode.user)
  };

  if (!result) {
    throw new Error("INVALID_CONNECT_CODE");
  }

  return result;
}

export async function revokeExtensionTokensForUser(userId: string): Promise<number> {
  const result = await revokePrimaryExtensionTokensForUser(userId, new Date());
  return result.count;
}

export async function requestIpAddress(): Promise<string> {
  const headerStore = await headers();
  const realIp = headerStore.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = headerStore.get("x-forwarded-for");
  if (xff) {
    const rightmost = xff.split(",").pop()?.trim();
    if (rightmost) return rightmost;
  }
  return "unknown";
}
