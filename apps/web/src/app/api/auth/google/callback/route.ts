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

  let profile: {
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    sub?: string;
  } | null = null;
  try {
    const profileResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        authorization: `Bearer ${tokenData.access_token}`
      }
    });

    if (!profileResp.ok) {
      return redirectWithError("google_profile", true);
    }
    profile = (await profileResp.json()) as {
      email?: string;
      email_verified?: boolean;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      sub?: string;
    };
  } catch {
    return redirectWithError("google_profile", true);
  }

  if (!profile?.sub) {
    return redirectWithError("google_sub", true);
  }

  const profileName =
    profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(" ") || null;
  const profileEmail = profile.email_verified === false ? null : profile.email;

  const user = await findOrCreateOAuthUser({
    provider: "google",
    providerUserId: profile.sub,
    email: profileEmail,
    name: profileName,
    pictureUrl: profile.picture
  });

  await ensureUserFeedToken(user.id);
  const sessionToken = await createSession(user.id);

  const response = NextResponse.redirect(`${env.appUrl}/app`);
  clearOAuthStateCookie(response, "google");
  await setSessionCookie(response, sessionToken);
  return response;
}
