import { makeToken } from "@articlepod/core";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isOAuthProviderConfigured, setOAuthStateCookie } from "@/lib/auth";

export async function GET() {
  if (!isOAuthProviderConfigured("google")) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=google_not_configured`);
  }

  const state = makeToken(16);
  const redirectUri = `${env.appUrl}/api/auth/google/callback`;
  const search = new URLSearchParams({
    client_id: env.googleClientId!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent"
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${search.toString()}`);
  setOAuthStateCookie(response, "google", state);
  return response;
}
