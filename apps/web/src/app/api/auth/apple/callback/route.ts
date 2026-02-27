import { NextRequest, NextResponse } from "next/server";
import {
  clearOAuthStateCookie,
  createSession,
  ensureUserFeedToken,
  findOrCreateOAuthUser,
  getOAuthStateFromRequest,
  isOAuthProviderConfigured,
  setSessionCookie
} from "@/lib/auth";
import { recordAnalyticsEventBestEffort } from "@/lib/admin-analytics/events";
import { env } from "@/lib/env";

function parseJwtPayload(idToken: string): Record<string, unknown> | null {
  const segments = idToken.split(".");
  if (segments.length < 2) {
    return null;
  }

  try {
    const payload = Buffer.from(segments[1], "base64url").toString("utf8");
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function redirectWithError(code: string, clearState = false) {
  const response = NextResponse.redirect(`${env.appUrl}/login?oauth_error=${code}`);
  if (clearState) {
    clearOAuthStateCookie(response, "apple");
  }
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = getOAuthStateFromRequest(request, "apple");

  if (!code || !state || !cookieState || cookieState !== state) {
    return redirectWithError("apple_state", true);
  }

  if (!isOAuthProviderConfigured("apple")) {
    return redirectWithError("apple_not_configured", true);
  }

  let tokenData: { id_token?: string } | null = null;
  try {
    const tokenResp = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: env.appleClientId!,
        client_secret: env.appleClientSecret!,
        redirect_uri: `${env.appUrl}/api/auth/apple/callback`
      })
    });

    if (!tokenResp.ok) {
      return redirectWithError("apple_token", true);
    }

    tokenData = (await tokenResp.json()) as { id_token?: string };
  } catch {
    return redirectWithError("apple_token", true);
  }

  if (!tokenData?.id_token) {
    return redirectWithError("apple_id_token", true);
  }

  const payload = parseJwtPayload(tokenData.id_token);
  const providerUserId = typeof payload?.sub === "string" ? payload.sub : null;
  const email = typeof payload?.email === "string" ? payload.email : null;
  const name = typeof payload?.name === "string" ? payload.name : null;

  if (!providerUserId) {
    return redirectWithError("apple_sub", true);
  }

  const oauthResult = await findOrCreateOAuthUser({
    provider: "apple",
    providerUserId,
    email,
    name
  });
  const user = oauthResult.user;

  await ensureUserFeedToken(user.id);
  if (oauthResult.created) {
    await recordAnalyticsEventBestEffort({
      eventType: "USER_SIGNUP",
      userId: user.id,
      dedupeKey: `user_signup:${user.id}`,
      authMethod: "APPLE",
      segmentAuth: "OAUTH_LINKED",
      userRole: user.role === "ADMIN" ? "ADMIN" : "USER",
      occurredAt: new Date(),
      metadata: {
        provider: "apple"
      }
    });
  }
  const sessionToken = await createSession(user.id, { authMethod: "APPLE" });

  const response = NextResponse.redirect(`${env.appUrl}/app`);
  clearOAuthStateCookie(response, "apple");
  await setSessionCookie(response, sessionToken);
  return response;
}
