import { NextRequest, NextResponse } from "next/server";
import {
  clearOAuthStateCookie,
  clearPostAuthRedirectCookie,
  createSession,
  ensureUserFeedToken,
  findOrCreateOAuthUser,
  getOAuthStateFromRequest,
  getPostAuthRedirectFromRequest,
  isOAuthProviderConfigured,
  setSessionCookie,
  updateUserGeoSnapshotFromRequest,
  verifyAppleIdToken
} from "@/lib/auth";
import { recordAnalyticsEventBestEffort } from "@/lib/admin-analytics/events";
import { buildLoginHref, resolvePostAuthRedirect } from "@/lib/auth-redirect";
import { env } from "@/lib/env";

function redirectWithError(request: NextRequest, code: string, clearState = false) {
  const response = NextResponse.redirect(
    `${env.appUrl}${buildLoginHref({ oauthError: code, next: getPostAuthRedirectFromRequest(request) })}`
  );
  if (clearState) {
    clearOAuthStateCookie(response, "apple");
  }
  clearPostAuthRedirectCookie(response);
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = getOAuthStateFromRequest(request, "apple");

  if (!code || !state || !cookieState || cookieState !== state) {
    return redirectWithError(request, "apple_state", true);
  }

  if (!isOAuthProviderConfigured("apple")) {
    return redirectWithError(request, "apple_not_configured", true);
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
      return redirectWithError(request, "apple_token", true);
    }

    tokenData = (await tokenResp.json()) as { id_token?: string };
  } catch {
    return redirectWithError(request, "apple_token", true);
  }

  if (!tokenData?.id_token) {
    return redirectWithError(request, "apple_id_token", true);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await verifyAppleIdToken(tokenData.id_token, env.appleClientId!);
  } catch {
    return redirectWithError(request, "apple_id_token_invalid", true);
  }

  const providerUserId = typeof payload.sub === "string" ? payload.sub : null;
  const email = typeof payload.email === "string" ? payload.email : null;
  const name = typeof payload.name === "string" ? payload.name : null;

  if (!providerUserId) {
    return redirectWithError(request, "apple_sub", true);
  }

  const oauthResult = await findOrCreateOAuthUser({
    provider: "apple",
    providerUserId,
    email,
    name
  });
  const user = oauthResult.user;

  if (oauthResult.created) {
    await ensureUserFeedToken(user.id);
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
  await updateUserGeoSnapshotFromRequest(user.id, request);
  const sessionToken = await createSession(user.id, { authMethod: "APPLE" });

  const response = NextResponse.redirect(`${env.appUrl}${resolvePostAuthRedirect(getPostAuthRedirectFromRequest(request), user.role)}`);
  clearOAuthStateCookie(response, "apple");
  clearPostAuthRedirectCookie(response);
  await setSessionCookie(response, sessionToken);
  return response;
}
