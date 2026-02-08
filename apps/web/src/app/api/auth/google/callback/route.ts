import { NextRequest, NextResponse } from "next/server";
import { createSession, ensureUserFeedToken, getOAuthStateFromRequest, setSessionCookie, clearOAuthStateCookie } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieState = getOAuthStateFromRequest(request);

  if (!code || !state || !cookieState || cookieState !== state) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=state`);
  }

  if (!env.googleClientId || !env.googleClientSecret) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=config`);
  }

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: `${env.appUrl}/api/auth/google/callback`,
      grant_type: "authorization_code"
    })
  });

  if (!tokenResp.ok) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=token`);
  }

  const tokenData = (await tokenResp.json()) as { access_token: string };

  const profileResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      authorization: `Bearer ${tokenData.access_token}`
    }
  });

  if (!profileResp.ok) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=profile`);
  }

  const profile = (await profileResp.json()) as { email?: string; name?: string };
  if (!profile.email) {
    return NextResponse.redirect(`${env.appUrl}/login?oauth_error=email`);
  }

  const user = await prisma.user.upsert({
    where: { email: profile.email.toLowerCase() },
    update: {
      name: profile.name || undefined
    },
    create: {
      email: profile.email.toLowerCase(),
      name: profile.name || null,
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
