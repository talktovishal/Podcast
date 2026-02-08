import { makeToken } from "@listenlater/core";
import { NextResponse } from "next/server";
import { setOAuthStateCookie } from "@/lib/auth";
import { env } from "@/lib/env";

export async function GET() {
  if (!env.appleClientId || !env.appleClientSecret) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "NOT_CONFIGURED",
        error_message: "Apple OAuth is not configured in this environment."
      },
      { status: 501 }
    );
  }

  const state = makeToken(16);
  const search = new URLSearchParams({
    response_type: "code",
    response_mode: "query",
    client_id: env.appleClientId,
    redirect_uri: `${env.appUrl}/api/auth/apple/callback`,
    scope: "name email",
    state
  });

  const response = NextResponse.redirect(`https://appleid.apple.com/auth/authorize?${search.toString()}`);
  setOAuthStateCookie(response, state);
  return response;
}
