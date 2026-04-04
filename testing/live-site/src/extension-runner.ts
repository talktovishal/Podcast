import { access, cp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { capturePageSnapshot, HTML_SNAPSHOT_MAX_BYTES } from "../../../apps/extension/capture-page.mjs";
import { EXTENSION_PACKAGE_ROOT, EXTENSION_ROOT } from "./paths.js";
import type { CorpusEntry, ExtensionBuild, ExtensionSmokeResult, LocalHarnessConfig, PathRunResult } from "./types.js";
import { generateConnectCode, pollForTerminalItem, refreshItems, runPodcastContract, submitSnapshot } from "./local-app.js";
import { classifyPathFailure, matchLocalExpectation } from "./report.js";
import { ensureDir, safeFileName, sleep } from "./utils.js";

async function createBrowser(): Promise<Browser> {
  return await chromium.launch({
    channel: "chromium",
    headless: true
  });
}

async function preparePage(url: string, page: Page): Promise<void> {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  await page.waitForTimeout(1_500);
}

async function captureFailureScreenshot(page: Page, screenshotPath: string): Promise<string | null> {
  try {
    await ensureDir(dirname(screenshotPath));
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });
    return screenshotPath;
  } catch {
    return null;
  }
}

async function readPopupDiagnostics(page: Page): Promise<{
  status: string;
  tokenState: string;
  connectionState: string;
  bodyClass: string;
  storedState: Record<string, unknown>;
  locationSearch: string;
  openTabs: Array<{ id: number | null; url: string; active: boolean }>;
}> {
  const readText = async (selector: string) => ((await page.locator(selector).textContent().catch(() => null)) || "").trim();
  const [status, tokenState, connectionState, bodyClass, storedState, locationSearch, openTabs] = await Promise.all([
    readText("#status"),
    readText("#token-state"),
    readText("#connection-state"),
    page.locator("body").getAttribute("class").catch(() => null),
    page
      .evaluate(() => {
        const chromeApi = (
          globalThis as typeof globalThis & {
            chrome?: {
              storage?: {
                local?: {
                  get?: (keys?: unknown) => Promise<Record<string, unknown>>;
                };
              };
            };
          }
        ).chrome;
        if (typeof chromeApi?.storage?.local?.get !== "function") {
          return {};
        }
        return chromeApi.storage.local.get(null) as Promise<Record<string, unknown>>;
      })
      .catch(() => ({}))
    ,
    page.evaluate(() => globalThis.window?.location?.search || "").catch(() => ""),
    page
      .evaluate(async () => {
        if (typeof chrome?.tabs?.query !== "function") {
          return [];
        }
        const tabs = await chrome.tabs.query({});
        return tabs.map((tab) => ({
          id: Number.isInteger(tab.id) ? tab.id ?? null : null,
          url: tab.url || "",
          active: Boolean(tab.active)
        }));
      })
      .catch(() => [])
  ]);

  return {
    status,
    tokenState,
    connectionState,
    bodyClass: bodyClass || "",
    storedState,
    locationSearch,
    openTabs
  };
}

async function resolvePopupTabId(page: Page, targetUrl: string): Promise<number | null> {
  return await page
    .evaluate(async (urlToMatch) => {
      const normalizeUrl = (input) => {
        if (typeof input !== "string") {
          return "";
        }
        try {
          const parsed = new URL(input);
          parsed.hash = "";
          return parsed.toString().replace(/\/$/, "");
        } catch {
          return input.trim().replace(/\/$/, "");
        }
      };

      if (!chrome?.tabs?.query) {
        return null;
      }

      const wanted = normalizeUrl(urlToMatch);
      const tabs = await chrome.tabs.query({});
      const match = tabs.find((tab) => normalizeUrl(tab.url || "") === wanted);
      return Number.isInteger(match?.id) ? match.id ?? null : null;
    }, targetUrl)
    .catch(() => null);
}

export async function runExtensionPath(
  entry: CorpusEntry,
  config: LocalHarnessConfig,
  reportDir: string,
  runLabel: string
): Promise<PathRunResult> {
  const startedAt = Date.now();
  const title = `[live-site:${runLabel}] ${entry.site} snapshot`;
  const browser = await createBrowser();

  try {
    const page = await browser.newPage();
    await preparePage(entry.url, page);

    const snapshot = await page.evaluate(capturePageSnapshot, {
      byteLimit: HTML_SNAPSHOT_MAX_BYTES
    });

    if (!snapshot?.ok || !snapshot.html) {
      const screenshotPath = await captureFailureScreenshot(
        page,
        join(reportDir, "screenshots", `${safeFileName(entry.id)}-extension-direct.png`)
      );
      const result: PathRunResult = {
        path: "extension",
        expected: entry.expectedExtension,
        actual: "manual_review",
        matchedExpectation: matchLocalExpectation(entry.expectedExtension, "manual_review"),
        status: matchLocalExpectation(entry.expectedExtension, "manual_review") ? "passed" : "failed",
        sourceUrl: entry.url,
        title,
        durationMs: Date.now() - startedAt,
        errorMessage: snapshot?.errorMessage || "capturePageSnapshot returned no HTML.",
        requiresManual: entry.requiresManual,
        captureStats: snapshot?.stats || null,
        screenshotPath
      };
      if (result.status === "failed") {
        result.classification = classifyPathFailure(result);
        result.recommendation = "Review the live page capture behavior and rerun this target with --site.";
      }
      return result;
    }

    const submission = await submitSnapshot(config, {
      url: snapshot.url || entry.url,
      title,
      html: snapshot.html
    });
    const item = await pollForTerminalItem(config, submission.itemId);
    if (!item) {
      const result: PathRunResult = {
        path: "extension",
        expected: entry.expectedExtension,
        actual: "manual_review",
        matchedExpectation: matchLocalExpectation(entry.expectedExtension, "manual_review"),
        status: matchLocalExpectation(entry.expectedExtension, "manual_review") ? "passed" : "failed",
        sourceUrl: entry.url,
        title,
        durationMs: Date.now() - startedAt,
        itemId: submission.itemId,
        errorMessage: "Timed out waiting for snapshot item to reach READY or FAILED.",
        requiresManual: entry.requiresManual,
        captureStats: snapshot.stats || null
      };
      if (result.status === "failed") {
        result.classification = classifyPathFailure(result);
        result.recommendation = "Inspect snapshot processing or worker behavior, then rerun this target.";
      }
      return result;
    }

    if (item.status === "READY") {
      const podcastContract = await runPodcastContract(config.feedUrl);
      const matchedExpectation = matchLocalExpectation(entry.expectedExtension, "ready");
      const result: PathRunResult = {
        path: "extension",
        expected: entry.expectedExtension,
        actual: "ready",
        matchedExpectation,
        status: matchedExpectation && podcastContract.passed ? "passed" : "failed",
        itemId: item.id,
        sourceUrl: entry.url,
        title,
        durationMs: Date.now() - startedAt,
        timeToReadyMs: Date.now() - startedAt,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
        extensionHintPresent: false,
        requiresManual: entry.requiresManual,
        captureStats: snapshot.stats || null,
        podcastContract
      };
      if (result.status === "failed") {
        result.classification = classifyPathFailure(result);
        result.recommendation =
          result.classification === "product_regression"
            ? "Investigate extension-capture processing or media contract behavior."
            : "Review corpus.md or quirks.md if the site itself changed.";
      }
      return result;
    }

    const result: PathRunResult = {
      path: "extension",
      expected: entry.expectedExtension,
      actual: "blocked_without_extension_hint",
      matchedExpectation: matchLocalExpectation(entry.expectedExtension, "blocked_without_extension_hint"),
      status: matchLocalExpectation(entry.expectedExtension, "blocked_without_extension_hint") ? "passed" : "failed",
      itemId: item.id,
      sourceUrl: entry.url,
      title,
      durationMs: Date.now() - startedAt,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      extensionHintPresent: false,
      requiresManual: entry.requiresManual,
      captureStats: snapshot.stats || null
    };
    if (result.status === "failed") {
      result.classification = classifyPathFailure(result);
      result.recommendation = "The site or snapshot behavior likely changed. Review quirks and rerun this target.";
    }
    return result;
  } catch (error) {
    const result: PathRunResult = {
      path: "extension",
      expected: entry.expectedExtension,
      actual: "harness_issue",
      matchedExpectation: false,
      status: "failed",
      sourceUrl: entry.url,
      title,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
      requiresManual: entry.requiresManual,
      classification: "harness_issue",
      recommendation: "Fix the browser/extension harness and rerun this target."
    };
    return result;
  } finally {
    await browser.close();
  }
}

async function resolveExtensionArtifactRoot(extensionBuild: ExtensionBuild): Promise<string> {
  const artifactRoot = extensionBuild === "package" ? EXTENSION_PACKAGE_ROOT : EXTENSION_ROOT;
  try {
    await access(artifactRoot);
  } catch {
    if (extensionBuild === "package") {
      throw new Error(`Packaged extension artifact not found at ${artifactRoot}. Run \`corepack pnpm extension:package\` first.`);
    }
    throw new Error(`Extension source tree not found at ${artifactRoot}.`);
  }
  return artifactRoot;
}

async function buildTemporaryExtension(appUrl: string, reportDir: string, extensionBuild: ExtensionBuild): Promise<string> {
  const extensionCopyRoot = join(reportDir, "tmp-extension");
  const extensionArtifactRoot = await resolveExtensionArtifactRoot(extensionBuild);
  await cp(extensionArtifactRoot, extensionCopyRoot, {
    recursive: true
  });

  const runtimeConfigPath = join(extensionCopyRoot, "runtime-config.js");
  const runtimeConfig = `(function initArticlePodExtensionConfig(globalObject) {
  const config = {
    localServerUrl: ${JSON.stringify(appUrl)},
    privateStoreServerUrl: "",
    publicStoreServerUrl: "",
    byExtensionId: {},
    defaultChannel: "local",
  };

  globalObject.ARTICLEPOD_EXTENSION_CONFIG = config;
})(window);
`;
  await writeFile(runtimeConfigPath, runtimeConfig, "utf8");
  return extensionCopyRoot;
}

async function discoverExtensionId(userDataDir: string, extensionPath: string): Promise<string> {
  const preferencePaths = [join(userDataDir, "Default", "Preferences"), join(userDataDir, "Default", "Secure Preferences")];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    for (const preferencesPath of preferencePaths) {
      try {
        const raw = await readFile(preferencesPath, "utf8");
        const parsed = JSON.parse(raw) as {
          extensions?: {
            settings?: Record<string, { path?: string; manifest?: { name?: string } }>;
          };
        };
        const settings = parsed.extensions?.settings || {};
        for (const [extensionId, details] of Object.entries(settings)) {
          if (resolve(details.path || "") === resolve(extensionPath) || details.manifest?.name === "ArticlePod Capture") {
            return extensionId;
          }
        }
      } catch {
        // wait for preferences file to appear
      }
    }
    await sleep(500);
  }

  throw new Error("Could not discover the unpacked extension ID from the Chromium profile.");
}

export async function runExtensionSmoke(
  entry: CorpusEntry,
  config: LocalHarnessConfig,
  reportDir: string,
  extensionBuild: ExtensionBuild = "source"
): Promise<ExtensionSmokeResult> {
  const startedAt = Date.now();
  const userDataDir = join(reportDir, "tmp-profile");
  const buildLabel = extensionBuild === "package" ? "packaged" : "source";

  try {
    const extensionPath = await buildTemporaryExtension(config.appUrl, reportDir, extensionBuild);
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });

    try {
      const targetPage = await context.newPage();
      const beforeItems = await refreshItems(config);
      const beforeIds = new Set(beforeItems.map((item) => item.id));
      await preparePage(entry.url, targetPage);

      const extensionId = await discoverExtensionId(userDataDir, extensionPath);
      const connectCode = await generateConnectCode(config);
      const popupPage = await context.newPage();
      await popupPage.goto(
        `chrome-extension://${extensionId}/popup.html?targetUrl=${encodeURIComponent(entry.url)}`,
        {
          waitUntil: "domcontentloaded",
          timeout: 30_000
        }
      );

      const targetTabId = await resolvePopupTabId(popupPage, entry.url);
      if (targetTabId) {
        await popupPage.goto(`chrome-extension://${extensionId}/popup.html?tab=${targetTabId}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000
        });
      }

      await popupPage.locator("#connect-code").fill(connectCode);
      await popupPage.locator("#connect-btn").click();
      let connected = true;
      try {
        await popupPage.waitForFunction(() => document.body.classList.contains("state-connected"), {
          timeout: 10_000
        });
      } catch {
        connected = false;
      }

      if (!connected) {
        const diagnostics = await readPopupDiagnostics(popupPage);
        const screenshotPath = join(reportDir, "screenshots", `${safeFileName(entry.id)}-extension-smoke.png`);
        await captureFailureScreenshot(popupPage, screenshotPath);
        return {
          status: "failed",
          targetId: entry.id,
          targetUrl: entry.url,
          durationMs: Date.now() - startedAt,
          extensionId,
          errorMessage:
            diagnostics.status ||
            `The ${buildLabel} popup did not enter the connected state. connectionState='${diagnostics.connectionState}' tokenState='${diagnostics.tokenState}' search='${diagnostics.locationSearch}' tabs='${JSON.stringify(diagnostics.openTabs)}'`,
          screenshotPath,
          recommendation: "Check popup connect flow, stored token state, and extension exchange responses."
        };
      }

      await popupPage.locator("#capture-btn").click();
      await popupPage.waitForTimeout(1_500);

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const items = await refreshItems(config);
        const created = items.find((item) => !beforeIds.has(item.id) && item.title);
        if (created) {
          return {
            status: "passed",
            targetId: entry.id,
            targetUrl: entry.url,
            durationMs: Date.now() - startedAt,
            extensionId
          };
        }
        const diagnostics = await readPopupDiagnostics(popupPage);
        if (diagnostics.status) {
          const normalizedStatus = diagnostics.status.toLowerCase();
          if (
            normalizedStatus.includes("unauthorized") ||
            normalizedStatus.includes("connect the extension first") ||
            normalizedStatus.includes("no active tab found") ||
            normalizedStatus.includes("only http/https pages can be captured") ||
            normalizedStatus.includes("unable to capture page html") ||
            normalizedStatus.includes("capture failed")
          ) {
            const screenshotPath = join(reportDir, "screenshots", `${safeFileName(entry.id)}-extension-smoke.png`);
            await captureFailureScreenshot(popupPage, screenshotPath);
            return {
              status: "failed",
              targetId: entry.id,
              targetUrl: entry.url,
              durationMs: Date.now() - startedAt,
              extensionId,
              errorMessage: `${diagnostics.status} (tokenState='${diagnostics.tokenState}' search='${diagnostics.locationSearch}' tabs='${JSON.stringify(diagnostics.openTabs)}')`,
              screenshotPath,
              recommendation: "Review popup auth/capture flow and inspect stored extension state in the smoke diagnostics."
            };
          }
        }
        await sleep(2_500);
      }

      const diagnostics = await readPopupDiagnostics(popupPage);
      const screenshotPath = join(reportDir, "screenshots", `${safeFileName(entry.id)}-extension-smoke.png`);
      await captureFailureScreenshot(popupPage, screenshotPath);
      return {
        status: "failed",
        targetId: entry.id,
        targetUrl: entry.url,
        durationMs: Date.now() - startedAt,
        extensionId,
        errorMessage:
          diagnostics.status ||
          `The ${buildLabel} extension smoke run did not create a new item in the dashboard refresh payload. search='${diagnostics.locationSearch}' tabs='${JSON.stringify(diagnostics.openTabs)}'`,
        screenshotPath,
        recommendation: "Check popup automation, extension storage state, and runtime-config targeting."
      };
    } finally {
      await context.close();
    }
  } catch (error) {
    return {
      status: "failed",
      targetId: entry.id,
      targetUrl: entry.url,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
      recommendation: "Fix the extension smoke harness before trusting popup-level failures."
    };
  }
}
