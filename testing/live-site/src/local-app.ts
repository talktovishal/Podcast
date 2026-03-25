import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PARITY_DOWN_PATH, PARITY_UP_PATH, REPO_ROOT, VERIFY_PODCAST_CONTRACT_PATH } from "./paths.js";
import type { LocalHarnessConfig, PodcastContractResult } from "./types.js";
import { fetchWithTimeout, joinCookieHeader, runCommand, summarizeCommandOutput, trimToSingleLine } from "./utils.js";

const LOGIN_PATH = "/api/auth/login";
const APP_PATH = "/app";
const REFRESH_PATH = "/api/seed-demo?refresh=items";
const CONNECT_CODE_PATH = "/api/auth/extension/connect-code";
const URL_SUBMIT_PATH = "/api/items/url";
const SNAPSHOT_SUBMIT_PATH = "/api/items/html-snapshot";

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

async function loadEnvFromFile(path: string): Promise<void> {
  try {
    const contents = await readFile(path, "utf8");
    for (const line of contents.split("\n")) {
      const parsed = parseEnvLine(line);
      if (!parsed || process.env[parsed.key]) {
        continue;
      }
      process.env[parsed.key] = parsed.value;
    }
  } catch {
    // ignore missing env files
  }
}

async function loadHarnessEnv(): Promise<void> {
  await loadEnvFromFile(resolve(REPO_ROOT, ".env"));
  await loadEnvFromFile(resolve(REPO_ROOT, ".env.parity"));
  await loadEnvFromFile(resolve(REPO_ROOT, ".env.parity.example"));
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

export async function createLocalHarness(keepStack: boolean): Promise<{
  config: LocalHarnessConfig;
  shutdown: () => Promise<void>;
}> {
  await loadHarnessEnv();

  const appUrl = normalizeUrl(process.env.APP_URL || "http://127.0.0.1:3000");
  const demoEmail = process.env.DEMO_EMAIL || "demo@articlepod.local";
  const demoPassword = process.env.DEMO_PASSWORD || "";

  if (!demoPassword) {
    throw new Error("DEMO_PASSWORD is required to run the live-site harness.");
  }

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
      email: demoEmail,
      password: demoPassword
    }),
    timeoutMs: 15_000
  });

  const loginPayload = (await loginResponse.json()) as LoginResponse;
  if (!loginResponse.ok || !loginPayload.ok) {
    throw new Error(loginPayload.error_message || `Demo login failed (${loginResponse.status})`);
  }

  const cookies =
    typeof loginResponse.headers.getSetCookie === "function"
      ? loginResponse.headers.getSetCookie()
      : [loginResponse.headers.get("set-cookie") || ""].filter(Boolean);
  const cookieHeader = joinCookieHeader(cookies);
  if (!cookieHeader) {
    throw new Error("Demo login did not return a session cookie.");
  }

  const feedUrl = await fetchFeedUrl(appUrl, cookieHeader);

  return {
    config: {
      appUrl,
      demoEmail,
      demoPassword,
      startedParity,
      feedUrl,
      cookieHeader
    },
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
  timeoutMs = 180_000
): Promise<DashboardRefreshItem | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const items = await refreshItems(config);
    const match = items.find((item) => item.id === itemId);
    if (match && (match.status === "READY" || match.status === "FAILED")) {
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

export function commandSummaryError(error: unknown): string {
  return error instanceof Error ? summarizeCommandOutput({ exitCode: 1, stdout: "", stderr: error.message }) : String(error);
}
