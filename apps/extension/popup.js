const STORAGE_KEYS = {
  serverUrl: "listenlater_server_url",
  extensionToken: "listenlater_extension_token",
  tokenExpiresAt: "listenlater_extension_token_expires_at"
};

const els = {
  serverUrl: document.getElementById("server-url"),
  connectCode: document.getElementById("connect-code"),
  connectBtn: document.getElementById("connect-btn"),
  disconnectBtn: document.getElementById("disconnect-btn"),
  captureBtn: document.getElementById("capture-btn"),
  status: document.getElementById("status"),
  tokenState: document.getElementById("token-state")
};

function setStatus(message, type = "") {
  els.status.textContent = message || "";
  els.status.className = `status ${type}`.trim();
}

async function getStoredState() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.serverUrl,
    STORAGE_KEYS.extensionToken,
    STORAGE_KEYS.tokenExpiresAt
  ]);
  return {
    serverUrl: result[STORAGE_KEYS.serverUrl] || "http://localhost:3000",
    extensionToken: result[STORAGE_KEYS.extensionToken] || "",
    tokenExpiresAt: result[STORAGE_KEYS.tokenExpiresAt] || ""
  };
}

async function setStoredState(nextState) {
  await chrome.storage.local.set(nextState);
}

async function loadState() {
  const state = await getStoredState();
  els.serverUrl.value = state.serverUrl;

  if (state.extensionToken) {
    const expires = state.tokenExpiresAt ? new Date(state.tokenExpiresAt).toLocaleString() : "unknown";
    els.tokenState.textContent = `Connected. Token expires: ${expires}`;
  } else {
    els.tokenState.textContent = "Not connected yet.";
  }
}

async function connectExtension() {
  const serverUrl = els.serverUrl.value.trim().replace(/\/$/, "");
  const connectCode = els.connectCode.value.trim();

  if (!serverUrl || !connectCode) {
    setStatus("Server URL and connect code are required.", "error");
    return;
  }

  els.connectBtn.disabled = true;
  setStatus("Connecting...");

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

    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error_message || "Failed to connect extension.", "error");
      return;
    }

    await setStoredState({
      [STORAGE_KEYS.serverUrl]: serverUrl,
      [STORAGE_KEYS.extensionToken]: payload.extension_token,
      [STORAGE_KEYS.tokenExpiresAt]: payload.expires_at
    });

    els.connectCode.value = "";
    setStatus("Extension connected successfully.", "success");
    await loadState();
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
}

async function captureCurrentPage() {
  const state = await getStoredState();
  const serverUrl = (els.serverUrl.value.trim() || state.serverUrl || "").replace(/\/$/, "");
  const extensionToken = state.extensionToken;

  if (!serverUrl || !extensionToken) {
    setStatus("Connect the extension first.", "error");
    return;
  }

  els.captureBtn.disabled = true;
  setStatus("Capturing current page...");

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
      func: () => {
        return {
          url: window.location.href,
          title: document.title || "",
          html: document.documentElement.outerHTML
        };
      }
    });

    const snapshot = results?.[0]?.result;
    if (!snapshot?.html || !snapshot?.url) {
      setStatus("Unable to capture page HTML from this tab.", "error");
      return;
    }

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
        capturedAt: new Date().toISOString()
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error_message || "Snapshot submission failed.", "error");
      return;
    }

    setStatus(`Captured and queued (item ${payload.item_id}).`, "success");
  } catch (error) {
    setStatus(`Capture failed: ${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    els.captureBtn.disabled = false;
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
els.serverUrl.addEventListener("change", async () => {
  const nextUrl = els.serverUrl.value.trim().replace(/\/$/, "");
  await setStoredState({ [STORAGE_KEYS.serverUrl]: nextUrl || "http://localhost:3000" });
});

void loadState();
