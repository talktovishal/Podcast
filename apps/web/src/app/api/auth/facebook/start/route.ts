import { makeToken } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { buildLoginHref } from "@/lib/auth-redirect";
import { isOAuthProviderConfigured, setOAuthStateCookie, setPostAuthRedirectCookie } from "@/lib/auth";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next");
  if (!isOAuthProviderConfigured("facebook")) {
    return NextResponse.redirect(`${env.appUrl}${buildLoginHref({ oauthError: "facebook_not_configured", next })}`);
  }

  const state = makeToken(16);
  const redirectUri = `${env.appUrl}/api/auth/facebook/callback`;
  const search = new URLSearchParams({
    client_id: env.facebookAppId!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "email",
    state
  });

  const response = NextResponse.redirect(`https://www.facebook.com/dialog/oauth?${search.toString()}`);
  setOAuthStateCookie(response, "facebook", state);
  setPostAuthRedirectCookie(response, next);
  return response;
}
