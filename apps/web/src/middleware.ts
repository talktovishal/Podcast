import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAMES } from "@articlepod/core/src/config/naming";

// Routes accessible without a session cookie.
const PUBLIC_PREFIXES: string[] = [
  "/api/auth/",
  "/api/health",
  "/api/media/",
  "/api/digest-media/",
  "/api/internal/",
  "/rss/",
  "/brand/",
  "/login",
  "/about",
  "/faq",
  "/pricing",
  "/product",
  "/resources",
  "/share",
];

const PUBLIC_EXACT: Set<string> = new Set([
  "/",
  "/login",
  "/apple-icon.png",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml"
]);

export function isPublicPathForAuth(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

function hasSessionCookie(request: NextRequest): boolean {
  const value =
    request.cookies.get(AUTH_COOKIE_NAMES.session)?.value ??
    request.cookies.get(AUTH_COOKIE_NAMES.legacySession)?.value ??
    "";
  // Expect a non-empty token-like string (32+ hex chars).
  return value.length >= 32;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublicPathForAuth(pathname)) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(request)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static files.
    "/((?!_next/static|_next/image|favicon\\.ico|apple-icon\\.png|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|brand/|icons/|webstore/).*)"
  ]
};
