import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PARITY_DOWN_PATH, PARITY_UP_PATH, REPO_ROOT, VERIFY_PODCAST_CONTRACT_PATH } from "./paths.js";
import type { LocalHarnessConfig, PodcastContractResult } from "./types.js";
import { fetchWithTimeout, joinCookieHeader, runCommand, summarizeCommandOutput, trimToSingleLine } from "./utils.js";

const LOGIN_PATH = "/api/auth/login";
const APP_PATH = "/app";
const REFRESH_PATH = "/api/seed-demo?refresh=items";
const ITEM_PATH = "/api/items";
const CONNECT_CODE_PATH = "/api/auth/extension/connect-code";
const URL_SUBMIT_PATH = "/api/items/url";
const SNAPSHOT_SUBMIT_PATH = "/api/items/html-snapshot";
const DEFAULT_DEMO_EMAIL = "demo@articlepod.local";
const DEFAULT_WEBSTORE_REVIEWER_EMAIL = "chrome-reviewer@articlepod.com";
const HARNESS_ITEM_TITLE_PREFIX = "[live-site:";

type HarnessAuth = Pick<LocalHarnessConfig, "authEmail" | "authPassword" | "authSource">;

type DashboardRefreshItem = {
  id: string;
  title: string;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
};

type LoginResponse = {
  ok: boolean;
  error_message?: string;
};

export function isHarnessItemTitle(title?: string | null): boolean {
  return typeof title === "string" && title.startsWith(HARNESS_ITEM_TITLE_PREFIX);
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
  if (!match) {
    return null;
  }
  return {
    key: match[1] || "",
    value: match[2] || ""
  };
}

async function readEnvFile(path: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  try {
    const contents = await readFile(path, "utf8");
    for (const line of contents.split("\n")) {
      const parsed = parseEnvLine(line);
      if (!parsed) {
        continue;
      }
      result[parsed.key] = parsed.value;
    }
  } catch {
    // ignore missing env files
  }
  return result;
}

export function applyHarnessEnvFiles(
  currentEnv: NodeJS.ProcessEnv,
  fileEnvSources: Array<Record<string, string>>
): NodeJS.ProcessEnv {
  const mergedFileEnv = fileEnvSources.reduce<Record<string, string>>(
    (accumulator, next) => ({
      ...accumulator,
      ...next
    }),
    {}
  );

  for (const [key, value] of Object.entries(mergedFileEnv)) {
    if (currentEnv[key] === undefined) {
      currentEnv[key] = value;
    }
  }

  return currentEnv;
}

export function selectHarnessAuth(env: NodeJS.ProcessEnv): HarnessAuth {
  const liveSiteEmail = env.LIVE_SITE_EMAIL?.trim() || "";
  const liveSitePassword = env.LIVE_SITE_PASSWORD?.trim() || "";
  if (liveSiteEmail || liveSitePassword) {
    if (!liveSiteEmail || !liveSitePassword) {
      throw new Error("LIVE_SITE_EMAIL and LIVE_SITE_PASSWORD must both be set when overriding local harness credentials.");
    }
    return {
      authEmail: liveSiteEmail,
      authPassword: liveSitePassword,
      authSource: "live-site"
    };
  }

  const reviewerPassword = env.WEBSTORE_REVIEWER_PASSWORD?.trim() || "";
  if (reviewerPassword) {
    return {
      authEmail: env.WEBSTORE_REVIEWER_EMAIL?.trim() || DEFAULT_WEBSTORE_REVIEWER_EMAIL,
      authPassword: reviewerPassword,
      authSource: "webstore-reviewer"
    };
  }

  const demoPassword = env.DEMO_PASSWORD?.trim() || "";
  if (demoPassword) {
    return {
      authEmail: env.DEMO_EMAIL?.trim() || DEFAULT_DEMO_EMAIL,
      authPassword: demoPassword,
      authSource: "demo"
    };
  }

  throw new Error(
    "LIVE_SITE_PASSWORD, WEBSTORE_REVIEWER_PASSWORD, or DEMO_PASSWORD is required to run the live-site harness."
  );
}

async function loadHarnessEnv(): Promise<void> {
  const [rootEnv, parityExampleEnv, parityEnv] = await Promise.all([
    readEnvFile(resolve(REPO_ROOT, ".env")),
    readEnvFile(resolve(REPO_ROOT, ".env.parity.example")),
    readEnvFile(resolve(REPO_ROOT, ".env.parity"))
  ]);

  applyHarnessEnvFiles(process.env, [rootEnv, parityExampleEnv, parityEnv]);
}

function normalizeUrl(input: string): string {
  return input.trim().replace(/\/$/, "");
}

async function isReachable(appUrl: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${appUrl}/login`, {
      method: "GET",
      timeoutMs: 5_000
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchFeedUrl(appUrl: string, cookieHeader: string): Promise<string> {
  const response = await fetchWithTimeout(`${appUrl}${APP_PATH}`, {
    headers: {
      cookie: cookieHeader
    },
    timeoutMs: 15_000
  });
  if (!response.ok) {
    throw new Error(`Failed to load dashboard HTML (${response.status})`);
  }
  const html = await response.text();
  const match = html.match(/\/rss\/([A-Za-z0-9_-]+)\.xml/);
  if (!match?.[0]) {
    throw new Error("Could not discover feed URL from dashboard HTML.");
  }
  return `${appUrl}${match[0]}`;
}

async function deleteHarnessItem(config: LocalHarnessConfig, itemId: string): Promise<void> {
  const response = await fetchWithTimeout(`${config.appUrl}${ITEM_PATH}/${itemId}`, {
    method: "DELETE",
    headers: {
      cookie: config.cookieHeader
    },
    timeoutMs: 20_000
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error_message?: string;
    };
    throw new Error(payload.error_message || `Failed to delete stale harness item (${response.status})`);
  }
}

export async function purgeHarnessItems(config: LocalHarnessConfig): Promise<number> {
  const items = await refreshItems(config);
  const harnessItems = items.filter((item) => isHarnessItemTitle(item.title));

  for (const item of harnessItems) {
    await deleteHarnessItem(config, item.id);
  }

  return harnessItems.length;
}

export async function createLocalHarness(keepStack: boolean): Promise<{
  config: LocalHarnessConfig;
  shutdown: () => Promise<void>;
}> {
  await loadHarnessEnv();

  const appUrl = normalizeUrl(process.env.APP_URL || "http://127.0.0.1:3000");
  const auth = selectHarnessAuth(process.env);

  let startedParity = false;
  if (!(await isReachable(appUrl))) {
    try {
      await runCommand(PARITY_UP_PATH, [], {
        cwd: REPO_ROOT,
        env: process.env
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `APP_URL '${appUrl}' was not reachable, and the parity stack could not start. Start Docker/Colima or launch the app manually, then rerun the live-site harness.\n${message}`
      );
    }
    startedParity = true;
  }

  const loginResponse = await fetchWithTimeout(`${appUrl}${LOGIN_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      mode: "login",
      email: auth.authEmail,
      password: auth.authPassword
    }),
    timeoutMs: 15_000
  });

  const loginPayload = (await loginResponse.json()) as LoginResponse;
  if (!loginResponse.ok || !loginPayload.ok) {
    throw new Error(loginPayload.error_message || `Harness login failed (${loginResponse.status})`);
  }

  const cookies =
    typeof loginResponse.headers.getSetCookie === "function"
      ? loginResponse.headers.getSetCookie()
      : [loginResponse.headers.get("set-cookie") || ""].filter(Boolean);
  const cookieHeader = joinCookieHeader(cookies);
  if (!cookieHeader) {
    throw new Error("Harness login did not return a session cookie.");
  }

  const feedUrl = await fetchFeedUrl(appUrl, cookieHeader);

  const config: LocalHarnessConfig = {
    appUrl,
    authEmail: auth.authEmail,
    authPassword: auth.authPassword,
    authSource: auth.authSource,
    startedParity,
    feedUrl,
    cookieHeader
  };

  await purgeHarnessItems(config);

  return {
    config,
    shutdown: async () => {
      if (!startedParity || keepStack) {
        return;
      }
      await runCommand(PARITY_DOWN_PATH, [], {
        cwd: REPO_ROOT,
        env: process.env,
        allowFailure: true
      });
    }
  };
}

export async function refreshItems(config: LocalHarnessConfig): Promise<DashboardRefreshItem[]> {
  const response = await fetchWithTimeout(`${config.appUrl}${REFRESH_PATH}&t=${Date.now()}`, {
    headers: {
      cookie: config.cookieHeader
    },
    timeoutMs: 15_000
  });
  if (!response.ok) {
    throw new Error(`Refresh API failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    ok: boolean;
    items: DashboardRefreshItem[];
  };
  if (!payload.ok || !Array.isArray(payload.items)) {
    throw new Error("Refresh API returned an unexpected payload.");
  }
  return payload.items;
}

export async function submitUrl(config: LocalHarnessConfig, url: string, title: string): Promise<{ itemId: string }> {
  const response = await fetchWithTimeout(`${config.appUrl}${URL_SUBMIT_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: config.cookieHeader
    },
    body: JSON.stringify({
      url,
      title
    }),
    timeoutMs: 20_000
  });

  const payload = (await response.json()) as {
    item_id?: string;
    error_message?: string;
  };
  if (!response.ok || !payload.item_id) {
    throw new Error(payload.error_message || `URL submission failed (${response.status})`);
  }
  return { itemId: payload.item_id };
}

export async function submitSnapshot(config: LocalHarnessConfig, input: {
  url: string;
  title: string;
  html: string;
}): Promise<{ itemId: string }> {
  const response = await fetchWithTimeout(`${config.appUrl}${SNAPSHOT_SUBMIT_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: config.cookieHeader
    },
    body: JSON.stringify({
      url: input.url,
      title: input.title,
      html: input.html,
      capturedAt: new Date().toISOString()
    }),
    timeoutMs: 20_000
  });
  const payload = (await response.json()) as {
    item_id?: string;
    error_message?: string;
  };
  if (!response.ok || !payload.item_id) {
    throw new Error(payload.error_message || `Snapshot submission failed (${response.status})`);
  }
  return { itemId: payload.item_id };
}

export async function generateConnectCode(config: LocalHarnessConfig): Promise<string> {
  const response = await fetchWithTimeout(`${config.appUrl}${CONNECT_CODE_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: config.cookieHeader
    },
    body: JSON.stringify({
      label: "live-site-extension-smoke"
    }),
    timeoutMs: 15_000
  });
  const payload = (await response.json()) as {
    connect_code?: string;
    error_message?: string;
  };
  if (!response.ok || !payload.connect_code) {
    throw new Error(payload.error_message || `Connect code generation failed (${response.status})`);
  }
  return payload.connect_code;
}

export async function pollForTerminalItem(
  config: LocalHarnessConfig,
  itemId: string,
  timeoutMs = 600_000
): Promise<DashboardRefreshItem | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const items = await refreshItems(config);
    const match = items.find((item) => item.id === itemId);
    if (
      match &&
      (match.status === "READY" ||
        match.status === "FAILED" ||
        (match.status === "QUEUED" && match.errorCode === "PRO_DAILY_LIMIT_DEFERRED"))
    ) {
      return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return null;
}

export async function runPodcastContract(feedUrl: string): Promise<PodcastContractResult> {
  const result = await runCommand(VERIFY_PODCAST_CONTRACT_PATH, [feedUrl], {
    cwd: REPO_ROOT,
    env: process.env,
    allowFailure: true
  });
  return {
    ran: true,
    passed: result.exitCode === 0,
    exitCode: result.exitCode,
    stdout: trimToSingleLine(result.stdout),
    stderr: trimToSingleLine(result.stderr)
  };
}

export function blockedOutcomeFromError(errorMessage?: string | null): {
  actual: "blocked_with_extension_hint" | "blocked_without_extension_hint";
  extensionHintPresent: boolean;
} {
  const normalized = trimToSingleLine(errorMessage).toLowerCase();
  const extensionHintPresent = normalized.includes("capture it with the chrome extension");
  return {
    actual: extensionHintPresent ? "blocked_with_extension_hint" : "blocked_without_extension_hint",
    extensionHintPresent
  };
}

export function isHarnessRuntimeFailure(errorMessage?: string | null): boolean {
  const normalized = trimToSingleLine(errorMessage).toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("run scripts/bootstrap-python-tts.sh") ||
    normalized.includes("ensure python-tts service is running") ||
    normalized.includes("tts provider unavailable") ||
    normalized.includes("audio processing is temporarily unavailable") ||
    normalized.includes("audio processing failed") ||
    normalized.includes("python kokoro provider failed") ||
    normalized.includes("python melo provider failed")
  );
}

export function isDeferredDueToDailyLimit(item?: DashboardRefreshItem | null): boolean {
  return item?.status === "QUEUED" && item.errorCode === "PRO_DAILY_LIMIT_DEFERRED";
}

export function commandSummaryError(error: unknown): string {
  return error instanceof Error ? summarizeCommandOutput({ exitCode: 1, stdout: "", stderr: error.message }) : String(error);
}
