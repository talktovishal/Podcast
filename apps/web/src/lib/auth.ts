import { AUTH_COOKIE_NAMES, createSecretToken, hashIncomingToken } from "@articlepod/core";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { env } from "./env";
import { prisma } from "./prisma";

const SESSION_COOKIE = AUTH_COOKIE_NAMES.session;
const LEGACY_SESSION_COOKIE = AUTH_COOKIE_NAMES.legacySession;
const OAUTH_STATE_COOKIE_PREFIX = AUTH_COOKIE_NAMES.oauthPrefix;
const LEGACY_OAUTH_STATE_COOKIE_PREFIX = AUTH_COOKIE_NAMES.legacyOauthPrefix;
const EXTENSION_CONNECT_CODE_TTL_MINUTES = Number(process.env.EXTENSION_CONNECT_CODE_TTL_MINUTES ?? 10);
const EXTENSION_TOKEN_TTL_DAYS = Number(process.env.EXTENSION_TOKEN_TTL_DAYS ?? 30);
const OAUTH_PLACEHOLDER_DOMAIN = "oauth.articlepod.local";

export type OAuthProvider = "google" | "apple";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
  role: "USER" | "ADMIN";
};

function normalizeRole(role: string): "USER" | "ADMIN" {
  return role === "ADMIN" ? "ADMIN" : "USER";
}

function authUserFromDbUser(user: { id: string; email: string; name: string | null; pictureUrl?: string | null; role: string }): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    pictureUrl: user.pictureUrl ?? null,
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

function extensionTokenExpiryDate(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + EXTENSION_TOKEN_TTL_DAYS);
  return expires;
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

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

export async function ensureUserFeedToken(userId: string): Promise<string> {
  const active = await prisma.feedToken.findFirst({ where: { userId, active: true } });
  if (active) {
    return active.tokenValue;
  }

  const token = createSecretToken();
  await prisma.feedToken.create({
    data: {
      userId,
      tokenValue: token.plain,
      tokenHash: token.hash,
      active: true
    }
  });
  return token.plain;
}

export async function createSession(userId: string): Promise<string> {
  const token = createSecretToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: token.hash,
      expiresAt: sessionExpiryDate()
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
    secure: process.env.NODE_ENV === "production",
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
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } });
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
  const oldTokens = await prisma.feedToken.findMany({ where: { userId, active: true } });
  if (oldTokens.length > 0) {
    await prisma.feedToken.updateMany({
      where: { userId, active: true },
      data: { active: false, rotatedAt: new Date() }
    });
  }

  const token = createSecretToken();
  await prisma.feedToken.create({
    data: {
      userId,
      tokenValue: token.plain,
      tokenHash: token.hash,
      active: true
    }
  });

  return token.plain;
}

export async function createShareToken(userId: string, expiresAt?: Date): Promise<string> {
  const token = createSecretToken();
  await prisma.shareToken.create({
    data: {
      userId,
      tokenValue: token.plain,
      tokenHash: token.hash,
      expiresAt
    }
  });

  return token.plain;
}

export async function getUserByShareToken(plain: string): Promise<AuthUser | null> {
  const tokenHash = hashIncomingToken(plain);
  const share = await prisma.shareToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

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
  const feedToken = await prisma.feedToken.findFirst({
    where: { tokenHash, active: true },
    include: { user: true }
  });

  if (!feedToken) {
    return null;
  }

  return authUserFromDbUser(feedToken.user);
}

export function setOAuthStateCookie(response: NextResponse, provider: OAuthProvider, state: string): void {
  response.cookies.set({
    name: oauthStateCookieName(OAUTH_STATE_COOKIE_PREFIX, provider),
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
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
  pictureUrl?: string | null;
}): Promise<{ id: string; email: string; name: string | null; pictureUrl: string | null; role: string }> {
  const normalizedEmail = normalizeOAuthEmail(input.email);

  return prisma.$transaction(async (tx) => {
    const existingIdentity = await tx.oAuthIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: input.provider,
          providerUserId: input.providerUserId
        }
      },
      include: {
        user: true
      }
    });

    if (existingIdentity) {
      const updateData: { name?: string; email?: string; pictureUrl?: string } = {};
      if (input.name?.trim()) {
        updateData.name = input.name.trim();
      }
      if (normalizedEmail && existingIdentity.user.email.endsWith(`@${OAUTH_PLACEHOLDER_DOMAIN}`)) {
        updateData.email = normalizedEmail;
      }
      if (input.pictureUrl?.trim()) {
        updateData.pictureUrl = input.pictureUrl.trim();
      }

      const user =
        Object.keys(updateData).length > 0
          ? await tx.user.update({
              where: { id: existingIdentity.userId },
              data: updateData
            })
          : existingIdentity.user;
      return user;
    }

    const userByEmail = normalizedEmail ? await tx.user.findUnique({ where: { email: normalizedEmail } }) : null;
    const user =
      userByEmail ??
      (await tx.user.create({
        data: {
          email: normalizedEmail ?? fallbackOAuthEmail(input.provider, input.providerUserId),
          name: input.name?.trim() || null,
          pictureUrl: input.pictureUrl?.trim() || null,
          role: "USER"
        }
      }));

    await tx.oAuthIdentity.create({
      data: {
        userId: user.id,
        provider: input.provider,
        providerUserId: input.providerUserId,
        emailAtLink: normalizedEmail
      }
    });

    return user;
  });
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
  const extensionToken = await prisma.extensionToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!extensionToken || extensionToken.revokedAt) {
    return null;
  }

  if (extensionToken.expiresAt && extensionToken.expiresAt.getTime() < Date.now()) {
    return null;
  }

  void prisma.extensionToken
    .update({
      where: { id: extensionToken.id },
      data: { lastUsedAt: new Date() }
    })
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

  await prisma.extensionConnectCode.create({
    data: {
      userId,
      codeHash: code.hash,
      label: label?.trim() || null,
      expiresAt
    }
  });

  return { connectCode: code.plain, expiresAt };
}

export async function exchangeExtensionConnectCode(input: {
  connectCode: string;
  label?: string;
}): Promise<{ token: string; expiresAt: Date; user: AuthUser }> {
  const codeHash = hashIncomingToken(input.connectCode);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const connectCode = await tx.extensionConnectCode.findUnique({
      where: { codeHash },
      include: { user: true }
    });

    if (!connectCode || connectCode.consumedAt || connectCode.expiresAt.getTime() < now.getTime()) {
      return null;
    }

    await tx.extensionConnectCode.update({
      where: { id: connectCode.id },
      data: {
        consumedAt: now
      }
    });

    const token = createSecretToken();
    const expiresAt = extensionTokenExpiryDate();

    await tx.extensionToken.create({
      data: {
        userId: connectCode.userId,
        tokenHash: token.hash,
        tokenValue: token.plain,
        label: input.label?.trim() || connectCode.label || "chrome-extension",
        scope: "ingest:html_snapshot",
        expiresAt
      }
    });

    return {
      token: token.plain,
      expiresAt,
      user: authUserFromDbUser(connectCode.user)
    };
  });

  if (!result) {
    throw new Error("INVALID_CONNECT_CODE");
  }

  return result;
}

export async function revokeExtensionTokensForUser(userId: string): Promise<number> {
  const result = await prisma.extensionToken.updateMany({
    where: {
      userId,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });
  return result.count;
}

export async function requestIpAddress(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
