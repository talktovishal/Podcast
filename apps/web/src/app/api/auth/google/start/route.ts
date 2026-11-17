import { makeToken } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { buildLoginHref } from "@/lib/auth-redirect";
import { env } from "@/lib/env";
import { isOAuthProviderConfigured, setOAuthStateCookie, setPostAuthRedirectCookie } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next");
  if (!isOAuthProviderConfigured("google")) {
    return NextResponse.redirect(`${env.appUrl}${buildLoginHref({ oauthError: "google_not_configured", next })}`);
  }

  const state = makeToken(16);
  const redirectUri = `${env.appUrl}/api/auth/google/callback`;
  const search = new URLSearchParams({
    client_id: env.googleClientId!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${search.toString()}`);
  setOAuthStateCookie(response, "google", state);
  setPostAuthRedirectCookie(response, next);
  return response;
}
