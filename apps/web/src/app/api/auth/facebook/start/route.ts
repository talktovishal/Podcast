import { makeToken } from "@articlepod/core";
import { NextResponse } from "next/server";
import { isOAuthProviderConfigured, setOAuthStateCookie } from "@/lib/auth";
import { env } from "@/lib/env";

export async function GET() {
  if (!isOAuthProviderConfigured("facebook")) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=facebook_not_configured`);
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
  return response;
}
