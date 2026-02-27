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

function redirectWithError(code: string, clearState = false) {
  const response = NextResponse.redirect(`${env.appUrl}/login?oauth_error=${code}`);
  if (clearState) {
    clearOAuthStateCookie(response, "google");
  }
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = getOAuthStateFromRequest(request, "google");

  if (!code || !state || !cookieState || cookieState !== state) {
    return redirectWithError("google_state", true);
  }

  if (!isOAuthProviderConfigured("google")) {
    return redirectWithError("google_not_configured", true);
  }

  let tokenData: { access_token?: string } | null = null;
  try {
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId!,
        client_secret: env.googleClientSecret!,
        redirect_uri: `${env.appUrl}/api/auth/google/callback`,
        grant_type: "authorization_code"
      })
    });

    if (!tokenResp.ok) {
      return redirectWithError("google_token", true);
    }
    tokenData = (await tokenResp.json()) as { access_token?: string };
  } catch {
    return redirectWithError("google_token", true);
  }

  if (!tokenData?.access_token) {
    return redirectWithError("google_token", true);
  }

  let profile: { email?: string; name?: string; sub?: string } | null = null;
  try {
    const profileResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        authorization: `Bearer ${tokenData.access_token}`
      }
    });

    if (!profileResp.ok) {
      return redirectWithError("google_profile", true);
    }
    profile = (await profileResp.json()) as { email?: string; name?: string; sub?: string };
  } catch {
    return redirectWithError("google_profile", true);
  }

  if (!profile?.sub) {
    return redirectWithError("google_sub", true);
  }

  const oauthResult = await findOrCreateOAuthUser({
    provider: "google",
    providerUserId: profile.sub,
    email: profile.email,
    name: profile.name
  });
  const user = oauthResult.user;

  await ensureUserFeedToken(user.id);
  if (oauthResult.created) {
    await recordAnalyticsEventBestEffort({
      eventType: "USER_SIGNUP",
      userId: user.id,
      dedupeKey: `user_signup:${user.id}`,
      authMethod: "GOOGLE",
      segmentAuth: "OAUTH_LINKED",
      userRole: user.role === "ADMIN" ? "ADMIN" : "USER",
      occurredAt: new Date(),
      metadata: {
        provider: "google"
      }
    });
  }
  const sessionToken = await createSession(user.id, { authMethod: "GOOGLE" });

  const response = NextResponse.redirect(`${env.appUrl}/app`);
  clearOAuthStateCookie(response, "google");
  await setSessionCookie(response, sessionToken);
  return response;
}
