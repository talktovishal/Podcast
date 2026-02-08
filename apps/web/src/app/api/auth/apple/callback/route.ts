import { NextRequest, NextResponse } from "next/server";
import { clearOAuthStateCookie, createSession, ensureUserFeedToken, getOAuthStateFromRequest, setSessionCookie } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

function parseJwtPayload(idToken: string): Record<string, unknown> | null {
  const segments = idToken.split(".");
  if (segments.length < 2) {
    return null;
  }

  try {
    const payload = Buffer.from(segments[1], "base64url").toString("utf8");
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = getOAuthStateFromRequest(request);

  if (!code || !state || !cookieState || cookieState !== state) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=state`);
  }

  if (!env.appleClientId || !env.appleClientSecret) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=config`);
  }

  const tokenResp = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: env.appleClientId,
      client_secret: env.appleClientSecret,
      redirect_uri: `${env.appUrl}/api/auth/apple/callback`
    })
  });

  if (!tokenResp.ok) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=token`);
  }

  const tokenData = (await tokenResp.json()) as { id_token?: string };
  if (!tokenData.id_token) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=idtoken`);
  }

  const payload = parseJwtPayload(tokenData.id_token);
  const email = typeof payload?.email === "string" ? payload.email.toLowerCase() : null;
  const name = typeof payload?.name === "string" ? payload.name : "Apple User";

  if (!email) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=email`);
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: {
      email,
      name,
      role: "USER"
    }
  });

  await ensureUserFeedToken(user.id);
  const sessionToken = await createSession(user.id);

  const response = NextResponse.redirect(`${env.appUrl}/app`);
  clearOAuthStateCookie(response);
  await setSessionCookie(response, sessionToken);
  return response;
}
