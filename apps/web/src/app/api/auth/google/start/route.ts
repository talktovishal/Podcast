import { makeToken } from "@listenlater/core";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { setOAuthStateCookie } from "@/lib/auth";

export async function GET() {
  if (!env.googleClientId || !env.googleClientSecret) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "NOT_CONFIGURED",
        error_message: "Google OAuth is not configured in this environment."
      },
      { status: 501 }
    );
  }

  const state = makeToken(16);
  const redirectUri = `${env.appUrl}/api/auth/google/callback`;
  const search = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent"
  });

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${search.toString()}`);
  setOAuthStateCookie(response, state);
  return response;
}
