function normalizeUrl(input) {
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
}

function parseQueryParams(search = "") {
  const params = new URLSearchParams(search || "");
  const tabParam = params.get("tab") || "";
  const targetUrl = params.get("targetUrl") || "";
  const tabId = Number.parseInt(tabParam, 10);
  return {
    tabId: Number.isInteger(tabId) && tabId > 0 ? tabId : null,
    targetUrl: targetUrl.trim()
  };
}

export async function resolvePopupTargetTab(chromeApi = globalThis.chrome, search = globalThis.window?.location?.search || "") {
  if (!chromeApi?.tabs) {
    throw new Error("Chrome tabs API is unavailable.");
  }

  const { tabId, targetUrl } = parseQueryParams(search);
  if (tabId) {
    return await chromeApi.tabs.get(tabId);
  }

  if (targetUrl) {
    const wanted = normalizeUrl(targetUrl);
    const tabs = await chromeApi.tabs.query({});
    const match = tabs.find((tab) => normalizeUrl(tab.url || "") === wanted);
    if (match) {
      return match;
    }
  }

  const [activeTab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
  return activeTab;
}
