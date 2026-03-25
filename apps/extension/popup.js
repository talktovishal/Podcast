import { capturePageSnapshot, HTML_SNAPSHOT_MAX_BYTES } from "./capture-page.mjs";
import { resolvePopupTargetTab } from "./target-tab.mjs";

const STORAGE_KEYS = {
  activeServerUrl: "articlepod_active_server_url",
  extensionToken: "articlepod_extension_token",
  tokenExpiresAt: "articlepod_extension_token_expires_at"
};
const LEGACY_STORAGE_KEYS = {
  serverUrl: "listenlater_server_url",
  extensionToken: "listenlater_extension_token",
  tokenExpiresAt: "listenlater_extension_token_expires_at"
};

const els = {
  connectSection: document.getElementById("connect-section"),
  connectionState: document.getElementById("connection-state"),
  connectCode: document.getElementById("connect-code"),
  connectBtn: document.getElementById("connect-btn"),
  disconnectBtn: document.getElementById("disconnect-btn"),
  captureBtn: document.getElementById("capture-btn"),
  captureImportance: document.getElementById("capture-importance"),
  captureTags: document.getElementById("capture-tags"),
  status: document.getElementById("status"),
  tokenState: document.getElementById("token-state")
};

const CAPTURE_IDLE_LABEL = "Capture Current Page";
const CAPTURE_STARTING_LABEL = "Starting Capture...";
const CAPTURE_QUEUED_LABEL = "Queued in ArticlePod";

let captureBusy = false;
let connectedState = false;

function setStatus(message, type = "") {
  els.status.textContent = message || "";
  els.status.className = `status ${type}`.trim();
}

function normalizeServerUrl(input) {
  if (typeof input !== "string") {
    return "";
  }
  return input.trim().replace(/\/$/, "");
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function getRuntimeConfig() {
  const globalConfig = window.ARTICLEPOD_EXTENSION_CONFIG;
  if (!globalConfig || typeof globalConfig !== "object") {
    return {
      localServerUrl: "https://articlepod.com",
      privateStoreServerUrl: "",
      publicStoreServerUrl: "",
      byExtensionId: {},
      defaultChannel: "local"
    };
  }
  return globalConfig;
}

function getConfiguredServerUrls(activeServerUrl = "") {
  const config = getRuntimeConfig();
  const byExtensionId = config.byExtensionId && typeof config.byExtensionId === "object" ? config.byExtensionId : {};
  const configuredChannel = byExtensionId[chrome.runtime.id] || config.defaultChannel || "local";
  const localUrl = normalizeServerUrl(config.localServerUrl || "https://articlepod.com");
  const privateUrl = normalizeServerUrl(config.privateStoreServerUrl || "");
  const publicUrl = normalizeServerUrl(config.publicStoreServerUrl || "");

  const prioritiesByChannel = {
    private: [privateUrl, publicUrl, localUrl],
    public: [publicUrl, privateUrl, localUrl],
    local: [localUrl, privateUrl, publicUrl]
  };

  const preferred = prioritiesByChannel[configuredChannel] || prioritiesByChannel.local;
  return uniqueStrings([normalizeServerUrl(activeServerUrl), ...preferred]);
}

async function setConnectedBadge() {
  if (!chrome.action) {
    return;
  }
  try {
    await chrome.action.setBadgeText({ text: "ON" });
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  } catch {
    // ignore toolbar badge errors in popup context
  }
}

async function setCapturePendingBadge() {
  if (!chrome.action) {
    return;
  }
  try {
    await chrome.action.setBadgeText({ text: "..." });
    await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
  } catch {
    // ignore toolbar badge errors in popup context
  }
}

async function setCaptureQueuedBadge() {
  if (!chrome.action) {
    return;
  }
  try {
    await chrome.action.setBadgeText({ text: "OK" });
    await chrome.action.setBadgeBackgroundColor({ color: "#15803d" });
    setTimeout(() => {
      void setConnectedBadge();
    }, 3500);
  } catch {
    // ignore toolbar badge errors in popup context
  }
}

async function clearBadge() {
  if (!chrome.action) {
    return;
  }
  try {
    await chrome.action.setBadgeText({ text: "" });
  } catch {
    // ignore toolbar badge errors in popup context
  }
}

function isStateConnected(state) {
  return Boolean(state.extensionToken);
}

function syncInteractivity() {
  els.captureBtn.disabled = captureBusy || !connectedState;
  els.disconnectBtn.disabled = !connectedState;
}

function setCaptureButtonLabel(state) {
  els.captureBtn.dataset.captureState = state === "idle" ? "" : state;

  if (state === "starting") {
    els.captureBtn.textContent = CAPTURE_STARTING_LABEL;
    return;
  }
  if (state === "queued") {
    els.captureBtn.textContent = CAPTURE_QUEUED_LABEL;
    return;
  }

  els.captureBtn.textContent = CAPTURE_IDLE_LABEL;
}

async function showCaptureQueuedNotice(tabId) {
  if (!tabId || !chrome.scripting) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const existing = document.getElementById("articlepod-capture-confirmation");
        existing?.remove();

        const notice = document.createElement("div");
        notice.id = "articlepod-capture-confirmation";
        notice.setAttribute("role", "status");
        notice.setAttribute("aria-live", "polite");
        notice.style.all = "initial";
        notice.style.position = "fixed";
        notice.style.top = "18px";
        notice.style.right = "18px";
        notice.style.zIndex = "2147483647";
        notice.style.maxWidth = "320px";
        notice.style.padding = "12px 14px";
        notice.style.borderRadius = "14px";
        notice.style.border = "1px solid #86efac";
        notice.style.background = "#ecfdf3";
        notice.style.boxShadow = "0 18px 40px rgba(22, 101, 52, 0.18)";
        notice.style.color = "#166534";
        notice.style.display = "block";
        notice.style.boxSizing = "border-box";
        notice.style.opacity = "0";
        notice.style.transform = "translateY(-6px)";
        notice.style.transition = "opacity 160ms ease, transform 160ms ease";
        notice.style.pointerEvents = "none";
        notice.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

        const title = document.createElement("div");
        title.textContent = "Queued in ArticlePod";
        title.style.fontSize = "14px";
        title.style.fontWeight = "700";
        title.style.lineHeight = "1.4";

        const detail = document.createElement("div");
        detail.textContent = "You do not need to click capture again.";
        detail.style.marginTop = "2px";
        detail.style.fontSize = "12px";
        detail.style.lineHeight = "1.45";
        detail.style.color = "#166534";

        notice.append(title, detail);
        (document.body || document.documentElement).appendChild(notice);

        requestAnimationFrame(() => {
          notice.style.opacity = "1";
          notice.style.transform = "translateY(0)";
        });

        window.setTimeout(() => {
          notice.style.opacity = "0";
          notice.style.transform = "translateY(-6px)";
          window.setTimeout(() => {
            notice.remove();
          }, 200);
        }, 4200);
      }
    });
  } catch {
    // ignore page-toast errors for sites that reject runtime DOM injection
  }
}

function renderState(state) {
  const connected = isStateConnected(state);
  connectedState = connected;
  document.body.classList.toggle("state-connected", connected);

  els.connectionState.textContent = connected ? "Configured" : "Not configured";
  els.connectSection.hidden = connected;

  if (connected) {
    const connectionTarget = state.activeServerUrl || "configured server";
    els.tokenState.textContent = `Connected to ${connectionTarget}. This token does not expire automatically.`;
  } else {
    els.tokenState.textContent = "Not connected yet. Paste a one-time code to connect.";
  }

  syncInteractivity();
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function getStoredState() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.activeServerUrl,
    STORAGE_KEYS.extensionToken,
    STORAGE_KEYS.tokenExpiresAt,
    LEGACY_STORAGE_KEYS.serverUrl,
    LEGACY_STORAGE_KEYS.extensionToken,
    LEGACY_STORAGE_KEYS.tokenExpiresAt
  ]);
  const activeServerUrl = normalizeServerUrl(result[STORAGE_KEYS.activeServerUrl] || result[LEGACY_STORAGE_KEYS.serverUrl] || "");
  const extensionToken = result[STORAGE_KEYS.extensionToken] || result[LEGACY_STORAGE_KEYS.extensionToken] || "";
  const tokenExpiresAt = result[STORAGE_KEYS.tokenExpiresAt] || result[LEGACY_STORAGE_KEYS.tokenExpiresAt] || "";
  const usedLegacyKeys =
    (!result[STORAGE_KEYS.activeServerUrl] && Boolean(result[LEGACY_STORAGE_KEYS.serverUrl])) ||
    (!result[STORAGE_KEYS.extensionToken] && Boolean(result[LEGACY_STORAGE_KEYS.extensionToken])) ||
    (!result[STORAGE_KEYS.tokenExpiresAt] && Boolean(result[LEGACY_STORAGE_KEYS.tokenExpiresAt]));

  return {
    activeServerUrl,
    extensionToken,
    usedLegacyKeys
  };
}

async function setStoredState(nextState) {
  await chrome.storage.local.set(nextState);
}

async function loadState() {
  const state = await getStoredState();

  if (state.usedLegacyKeys) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.activeServerUrl]: state.activeServerUrl,
      [STORAGE_KEYS.extensionToken]: state.extensionToken
    });
  }

  await chrome.storage.local.remove([
    STORAGE_KEYS.tokenExpiresAt,
    LEGACY_STORAGE_KEYS.serverUrl,
    LEGACY_STORAGE_KEYS.extensionToken,
    LEGACY_STORAGE_KEYS.tokenExpiresAt
  ]);

  renderState(state);
  setCaptureButtonLabel("idle");
  if (isStateConnected(state)) {
    await setConnectedBadge();
  } else {
    await clearBadge();
  }

  return state;
}

async function connectExtension() {
  const connectCode = els.connectCode.value.trim();

  if (!connectCode) {
    setStatus("Connect code is required.", "error");
    return;
  }

  const storedState = await getStoredState();
  const serverUrls = getConfiguredServerUrls(storedState.activeServerUrl);
  if (serverUrls.length === 0) {
    setStatus("Extension server URL is not configured. Update runtime-config.js.", "error");
    return;
  }

  els.connectBtn.disabled = true;
  setStatus("Connecting...");

  try {
    const failedTargets = [];
    for (const serverUrl of serverUrls) {
      try {
        const response = await fetch(`${serverUrl}/api/auth/extension/exchange`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            connectCode,
            label: "chrome-extension"
          })
        });
        const payload = await readJson(response);
        if (response.ok) {
          await setStoredState({
            [STORAGE_KEYS.activeServerUrl]: serverUrl,
            [STORAGE_KEYS.extensionToken]: payload.extension_token
          });
          els.connectCode.value = "";
          setStatus("Extension connected successfully. It will stay connected until you revoke or disconnect it.", "success");
          await loadState();
          return;
        }
        failedTargets.push(payload.error_message || `${serverUrl} returned ${response.status}`);
      } catch (error) {
        failedTargets.push(`${serverUrl} unreachable (${error instanceof Error ? error.message : String(error)})`);
      }
    }

    setStatus(
      failedTargets[0] || "Failed to connect extension. Verify connect code and configured server URLs.",
      "error"
    );
  } catch (error) {
    setStatus(`Connect failed: ${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    els.connectBtn.disabled = false;
  }
}

async function disconnectExtension() {
  await chrome.storage.local.remove([STORAGE_KEYS.extensionToken, STORAGE_KEYS.tokenExpiresAt]);
  setStatus("Disconnected. Generate a new connect code to reconnect.", "success");
  await loadState();
  els.connectCode.focus();
}

async function captureCurrentPage() {
  const state = await getStoredState();
  const extensionToken = state.extensionToken;
  const serverUrl = state.activeServerUrl || getConfiguredServerUrls(state.activeServerUrl)[0] || "";

  if (!serverUrl) {
    setStatus("Extension server URL is not configured. Update runtime-config.js.", "error");
    return;
  }

  if (!extensionToken) {
    setStatus("Connect the extension first.", "error");
    return;
  }

  captureBusy = true;
  syncInteractivity();
  setCaptureButtonLabel("starting");
  setStatus("Capture started. Reading current tab...");
  await setCapturePendingBadge();

  try {
    const activeTab = await resolvePopupTargetTab();
    if (!activeTab?.id || !activeTab.url) {
      setStatus("No active tab found.", "error");
      return;
    }

    if (!/^https?:/i.test(activeTab.url)) {
      setStatus("Only HTTP/HTTPS pages can be captured.", "error");
      return;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: capturePageSnapshot,
      args: [{ byteLimit: HTML_SNAPSHOT_MAX_BYTES }]
    });

    const snapshot = results?.[0]?.result;
    if (!snapshot?.ok) {
      setStatus(snapshot?.errorMessage || "Unable to capture page HTML from this tab.", "error");
      return;
    }

    if (!snapshot.html || !snapshot.url) {
      setStatus("Unable to capture page HTML from this tab.", "error");
      return;
    }

    const captureSummary = [];
    if (snapshot.stats?.revealClicks) {
      captureSummary.push(`${snapshot.stats.revealClicks} reveal${snapshot.stats.revealClicks === 1 ? "" : "s"}`);
    }
    if (snapshot.stats?.scrollPasses) {
      captureSummary.push(`${snapshot.stats.scrollPasses} scroll pass${snapshot.stats.scrollPasses === 1 ? "" : "es"}`);
    }
    if (snapshot.stats?.conservativeHost) {
      captureSummary.push("conservative host mode");
    }
    setStatus(
      captureSummary.length > 0 ? `Capture prepared (${captureSummary.join(", ")}). Uploading...` : "Capture prepared. Uploading..."
    );

    const response = await fetch(`${serverUrl}/api/items/html-snapshot`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${extensionToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        url: snapshot.url,
        title: snapshot.title || undefined,
        html: snapshot.html,
        capturedAt: new Date().toISOString(),
        importance: els.captureImportance?.value || "LOW",
        tags: els.captureTags?.value || ""
      })
    });

    const payload = await readJson(response);
    if (!response.ok) {
      setStatus(payload.error_message || "Snapshot submission failed.", "error");
      if (response.status === 401 || response.status === 403) {
        await chrome.storage.local.remove([STORAGE_KEYS.extensionToken, STORAGE_KEYS.tokenExpiresAt]);
        await loadState();
      }
      return;
    }

    setStatus("");
    setCaptureButtonLabel("queued");
    await setCaptureQueuedBadge();
    await showCaptureQueuedNotice(activeTab.id);
  } catch (error) {
    setStatus(`Capture failed: ${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    captureBusy = false;
    syncInteractivity();
    if (!els.captureBtn.textContent || els.captureBtn.textContent === CAPTURE_STARTING_LABEL) {
      setCaptureButtonLabel("idle");
    }
  }
}

els.connectBtn.addEventListener("click", () => {
  void connectExtension();
});
els.disconnectBtn.addEventListener("click", () => {
  void disconnectExtension();
});
els.captureBtn.addEventListener("click", () => {
  void captureCurrentPage();
});

void loadState();
