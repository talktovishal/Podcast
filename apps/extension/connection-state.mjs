export const DEFAULT_SERVER_URL = "https://articlepod.com";

export const STORAGE_KEYS = {
  activeServerUrl: "articlepod_active_server_url",
  extensionToken: "articlepod_extension_token",
  tokenExpiresAt: "articlepod_extension_token_expires_at",
};

export const LEGACY_STORAGE_KEYS = {
  serverUrl: "listenlater_server_url",
  extensionToken: "listenlater_extension_token",
  tokenExpiresAt: "listenlater_extension_token_expires_at",
};

export function normalizeServerUrl(input) {
  if (typeof input !== "string") {
    return "";
  }
  return input.trim().replace(/\/$/, "");
}

export async function getStoredConnectionState(storageArea = chrome.storage.local) {
  const result = await storageArea.get([
    STORAGE_KEYS.activeServerUrl,
    STORAGE_KEYS.extensionToken,
    LEGACY_STORAGE_KEYS.serverUrl,
    LEGACY_STORAGE_KEYS.extensionToken,
  ]);

  return {
    activeServerUrl: normalizeServerUrl(
      result[STORAGE_KEYS.activeServerUrl] ||
        result[LEGACY_STORAGE_KEYS.serverUrl] ||
        DEFAULT_SERVER_URL,
    ),
    extensionToken:
      result[STORAGE_KEYS.extensionToken] ||
      result[LEGACY_STORAGE_KEYS.extensionToken] ||
      "",
  };
}

export async function clearStoredExtensionToken(storageArea = chrome.storage.local) {
  await storageArea.remove([
    STORAGE_KEYS.extensionToken,
    STORAGE_KEYS.tokenExpiresAt,
    LEGACY_STORAGE_KEYS.extensionToken,
    LEGACY_STORAGE_KEYS.tokenExpiresAt,
  ]);
}
