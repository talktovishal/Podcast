import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError, errorCodes } from "../errors/codes";
import { BRAND_BOT_USER_AGENT } from "../config/brand";

const PRIVATE_IPV4_PATTERNS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./
];

const PRIVATE_IPV6_PATTERNS = [/^::1$/, /^fc/i, /^fd/i, /^fe80:/i];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const REDIRECT_DISCOVERY_TIMEOUT_MS = 5_000;
const MAX_CANONICAL_REDIRECTS = 5;

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "169.254.169.254"]);

function isPrivateIp(address: string): boolean {
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    return PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(address));
  }

  if (ipVersion === 6) {
    const normalized = address.toLowerCase();
    return PRIVATE_IPV6_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  return true;
}

function prioritizeFetchCandidates(addresses: string[]): string[] {
  const unique = Array.from(new Set(addresses));
  return unique.sort((left, right) => {
    const leftFamily = isIP(left);
    const rightFamily = isIP(right);
    if (leftFamily === rightFamily) {
      return 0;
    }
    if (leftFamily === 4) {
      return -1;
    }
    if (rightFamily === 4) {
      return 1;
    }
    return 0;
  });
}

export type ValidatedFetchableUrl = {
  url: URL;
  resolvedIp: string;
  resolvedIps: string[];
};

export type CanonicalFetchableUrl = ValidatedFetchableUrl & {
  canonicalUrl: string;
  redirected: boolean;
  redirectCount: number;
};

export async function validateFetchableUrl(rawUrl: string): Promise<ValidatedFetchableUrl> {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError(errorCodes.INVALID_INPUT, "Please provide a valid URL.", 400);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError(errorCodes.URL_BLOCKED, "Only HTTP and HTTPS URLs are supported.", 400);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new AppError(errorCodes.URL_BLOCKED, "This URL host is blocked for security reasons.", 400);
  }

  // If the host is already a literal IP address, validate it directly.
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new AppError(
        errorCodes.URL_BLOCKED,
        "This URL resolves to a private/internal address and cannot be fetched.",
        400
      );
    }
    return { url: parsed, resolvedIp: hostname, resolvedIps: [hostname] };
  }

  const resolved = await lookup(hostname, { all: true, verbatim: true });
  if (resolved.length === 0) {
    throw new AppError(errorCodes.URL_BLOCKED, "Could not resolve URL host.", 400);
  }

  for (const record of resolved) {
    if (isPrivateIp(record.address)) {
      throw new AppError(
        errorCodes.URL_BLOCKED,
        "This URL resolves to a private/internal address and cannot be fetched.",
        400
      );
    }
  }

  const resolvedIps = prioritizeFetchCandidates(resolved.map((record) => record.address));
  if (resolvedIps.length === 0) {
    throw new AppError(errorCodes.URL_BLOCKED, "Could not resolve URL host.", 400);
  }

  return { url: parsed, resolvedIp: resolvedIps[0], resolvedIps };
}

async function fetchRedirectLocation(url: URL): Promise<string | null> {
  const methods: Array<"HEAD" | "GET"> = ["HEAD", "GET"];
  for (const method of methods) {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        redirect: "manual",
        headers: { "user-agent": BRAND_BOT_USER_AGENT },
        signal: AbortSignal.timeout(REDIRECT_DISCOVERY_TIMEOUT_MS)
      });
    } catch {
      return null;
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      return response.headers.get("location");
    }

    if (method === "HEAD" && (response.status === 405 || response.status === 501)) {
      continue;
    }

    return null;
  }

  return null;
}

export async function canonicalizeFetchableUrl(rawUrl: string): Promise<CanonicalFetchableUrl> {
  const visited = new Set<string>();
  let redirectCount = 0;
  let validated = await validateFetchableUrl(rawUrl);
  let currentUrl = validated.url.toString();

  while (redirectCount < MAX_CANONICAL_REDIRECTS) {
    visited.add(currentUrl);
    const location = await fetchRedirectLocation(validated.url);
    if (!location) {
      return {
        ...validated,
        canonicalUrl: currentUrl,
        redirected: redirectCount > 0,
        redirectCount
      };
    }

    const nextUrl = new URL(location, validated.url).toString();
    if (visited.has(nextUrl)) {
      break;
    }

    validated = await validateFetchableUrl(nextUrl);
    currentUrl = validated.url.toString();
    redirectCount += 1;
  }

  return {
    ...validated,
    canonicalUrl: currentUrl,
    redirected: redirectCount > 0,
    redirectCount
  };
}
