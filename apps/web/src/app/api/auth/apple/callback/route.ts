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
  const rawEmail = typeof payload?.email === "string" ? payload.email : null;
  const emailVerified = payload?.email_verified;
  // Apple's email_verified can be true, false, "true", "false", or absent.
  // When absent/undefined the email is considered verified (Apple default).
  const profileEmail = emailVerified === "false" || emailVerified === false ? null : rawEmail;

  // Apple sends the user's name in the id_token `name` claim (as a string or object)
  // but only on the first authorization. On repeat logins it may be absent.
  let profileName: string | null = null;
  if (typeof payload?.name === "string" && payload.name.trim()) {
    profileName = payload.name.trim();
  } else if (payload?.name && typeof payload.name === "object") {
    const nameObj = payload.name as { firstName?: string; lastName?: string };
    profileName = [nameObj.firstName?.trim(), nameObj.lastName?.trim()].filter(Boolean).join(" ") || null;
  }

  if (!providerUserId) {
    return redirectWithError("apple_sub", true);
  }

  const user = await findOrCreateOAuthUser({
    provider: "apple",
    providerUserId,
    email: profileEmail,
    name: profileName
  });

  await ensureUserFeedToken(user.id);
  const sessionToken = await createSession(user.id);

  const response = NextResponse.redirect(`${env.appUrl}/app`);
  clearOAuthStateCookie(response, "apple");
  await setSessionCookie(response, sessionToken);
  return response;
}
