import { createSecretToken, hashIncomingToken } from "@listenlater/core";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { env } from "./env";
import { prisma } from "./prisma";

const SESSION_COOKIE = "listenlater_session";
const OAUTH_STATE_COOKIE = "listenlater_oauth_state";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
};

function normalizeRole(role: string): "USER" | "ADMIN" {
  return role === "ADMIN" ? "ADMIN" : "USER";
}

function sessionExpiryDate(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + env.sessionTtlDays);
  return expires;
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
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    expires: new Date(0),
    path: "/"
  });
}

export async function getAuthUserFromRequest(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  return getAuthUserFromToken(token);
}

export async function getAuthUserFromCookies(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
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

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: normalizeRole(session.user.role)
  };
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

  return {
    id: share.user.id,
    email: share.user.email,
    name: share.user.name,
    role: normalizeRole(share.user.role)
  };
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

  return {
    id: feedToken.user.id,
    email: feedToken.user.email,
    name: feedToken.user.name,
    role: normalizeRole(feedToken.user.role)
  };
}

export function setOAuthStateCookie(response: NextResponse, state: string): void {
  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10
  });
}

export function getOAuthStateFromRequest(request: NextRequest): string | null {
  return request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null;
}

export function clearOAuthStateCookie(response: NextResponse): void {
  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: "",
    expires: new Date(0),
    path: "/"
  });
}

export async function requestIpAddress(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
