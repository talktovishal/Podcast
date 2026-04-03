export const DEFAULT_POST_AUTH_REDIRECT = "/app";

export function normalizePostAuthRedirect(input: string | null | undefined): string {
  const value = input?.trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_POST_AUTH_REDIRECT;
  }

  try {
    const normalized = new URL(value, "http://articlepod.local");
    const path = `${normalized.pathname}${normalized.search}${normalized.hash}`;
    if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/api/") || path.startsWith("/login")) {
      return DEFAULT_POST_AUTH_REDIRECT;
    }
    return path;
  } catch {
    return DEFAULT_POST_AUTH_REDIRECT;
  }
}

export function resolvePostAuthRedirect(requestedPath: string | null | undefined, role: string): string {
  const normalized = normalizePostAuthRedirect(requestedPath);
  if (normalized === DEFAULT_POST_AUTH_REDIRECT && role === "ADMIN") {
    return "/admin";
  }
  return normalized;
}

export function buildLoginHref(options?: {
  next?: string | null | undefined;
  oauthError?: string | null | undefined;
}): string {
  const search = new URLSearchParams();
  if (options?.oauthError) {
    search.set("oauth_error", options.oauthError);
  }

  const next = normalizePostAuthRedirect(options?.next);
  if (next !== DEFAULT_POST_AUTH_REDIRECT) {
    search.set("next", next);
  }

  const query = search.toString();
  return query ? `/?${query}` : "/";
}

export function buildOAuthStartHref(startPath: string, next?: string | null | undefined): string {
  const normalized = normalizePostAuthRedirect(next);
  if (normalized === DEFAULT_POST_AUTH_REDIRECT) {
    return startPath;
  }

  const search = new URLSearchParams({ next: normalized });
  return `${startPath}?${search.toString()}`;
}
