import { NextRequest, NextResponse } from "next/server";
import {
  clearOAuthStateCookie,
  createSession,
  ensureUserFeedToken,
  findOrCreateOAuthUser,
  getOAuthStateFromRequest,
  isOAuthProviderConfigured,
  setSessionCookie,
  updateUserGeoSnapshotFromRequest
} from "@/lib/auth";
import { recordAnalyticsEventBestEffort } from "@/lib/admin-analytics/events";
import { env } from "@/lib/env";

function redirectWithError(code: string, clearState = false) {
  const response = NextResponse.redirect(`${env.appUrl}/login?oauth_error=${code}`);
  if (clearState) {
    clearOAuthStateCookie(response, "facebook");
  }
  return response;
}

export async function GET(request: NextRequest) {
  const callbackError = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = getOAuthStateFromRequest(request, "facebook");

  if (callbackError) {
    return redirectWithError("facebook_access_denied", true);
  }

  if (!code || !state || !cookieState || cookieState !== state) {
    return redirectWithError("facebook_state", true);
  }

  if (!isOAuthProviderConfigured("facebook")) {
    return redirectWithError("facebook_not_configured", true);
  }

  let tokenData: { access_token?: string } | null = null;
  try {
    const tokenUrl = new URL("https://graph.facebook.com/oauth/access_token");
    tokenUrl.search = new URLSearchParams({
      client_id: env.facebookAppId!,
      client_secret: env.facebookAppSecret!,
      redirect_uri: `${env.appUrl}/api/auth/facebook/callback`,
      code
    }).toString();

    const tokenResp = await fetch(tokenUrl);
    if (!tokenResp.ok) {
      return redirectWithError("facebook_token", true);
    }

    tokenData = (await tokenResp.json()) as { access_token?: string };
  } catch {
    return redirectWithError("facebook_token", true);
  }

  if (!tokenData?.access_token) {
    return redirectWithError("facebook_token", true);
  }

  let profile: { id?: string; email?: string; name?: string } | null = null;
  try {
    const profileUrl = new URL("https://graph.facebook.com/me");
    profileUrl.search = new URLSearchParams({
      access_token: tokenData.access_token,
      fields: "id,name,email"
    }).toString();

    const profileResp = await fetch(profileUrl);
    if (!profileResp.ok) {
      return redirectWithError("facebook_profile", true);
    }

    profile = (await profileResp.json()) as { id?: string; email?: string; name?: string };
  } catch {
    return redirectWithError("facebook_profile", true);
  }

  if (!profile?.id) {
    return redirectWithError("facebook_id", true);
  }

  const oauthResult = await findOrCreateOAuthUser({
    provider: "facebook",
    providerUserId: profile.id,
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
      authMethod: "FACEBOOK",
      segmentAuth: "OAUTH_LINKED",
      userRole: user.role === "ADMIN" ? "ADMIN" : "USER",
      occurredAt: new Date(),
      metadata: {
        provider: "facebook"
      }
    });
  }
  await updateUserGeoSnapshotFromRequest(user.id, request);
  const sessionToken = await createSession(user.id, { authMethod: "FACEBOOK" });

  const response = NextResponse.redirect(`${env.appUrl}/app`);
  clearOAuthStateCookie(response, "facebook");
  await setSessionCookie(response, sessionToken);
  return response;
}
