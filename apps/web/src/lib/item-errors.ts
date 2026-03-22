const CHROME_EXTENSION_CAPTURE_HINT = "capture it with the chrome extension";

export function recommendsChromeExtensionCapture(errorMessage?: string | null): boolean {
  return (errorMessage || "").toLowerCase().includes(CHROME_EXTENSION_CAPTURE_HINT);
}
