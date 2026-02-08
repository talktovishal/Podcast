import { makeToken } from "@listenlater/core";
import { NextResponse } from "next/server";
import { isOAuthProviderConfigured, setOAuthStateCookie } from "@/lib/auth";
import { env } from "@/lib/env";

export async function GET() {
  if (!isOAuthProviderConfigured("apple")) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=apple_not_configured`);
  }

  const state = makeToken(16);
  const search = new URLSearchParams({
    response_type: "code",
    response_mode: "query",
    client_id: env.appleClientId!,
    redirect_uri: `${env.appUrl}/api/auth/apple/callback`,
    scope: "name email",
    state
  });

  const response = NextResponse.redirect(`https://appleid.apple.com/auth/authorize?${search.toString()}`);
  setOAuthStateCookie(response, "apple", state);
  return response;
}
