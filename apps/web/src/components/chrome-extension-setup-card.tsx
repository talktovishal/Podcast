"use client";

import Link from "next/link";
import { useState } from "react";
import { CopyableValueBox } from "@/components/copyable-value-box";

export const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/articlepod-capture/epjncnckcohefbopcbpfppfgljkkcmgp";

type ChromeExtensionSetupCardProps = {
  isAuthenticated: boolean;
  id?: string;
  loginHref?: string;
};

export function ChromeExtensionSetupCard({
  isAuthenticated,
  id,
  loginHref = "/login",
}: ChromeExtensionSetupCardProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [extensionConnectCode, setExtensionConnectCode] = useState<string | null>(null);
  const [extensionCodeExpiresAt, setExtensionCodeExpiresAt] = useState<string | null>(null);

  async function generateExtensionConnectCode() {
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/auth/extension/connect-code", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "chrome-extension" }),
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Could not generate extension connect code.");
        return;
      }

      setExtensionConnectCode(json.connect_code);
      setExtensionCodeExpiresAt(json.expires_at);
      setStatusMessage(
        "Extension connect code generated. Use it within 24 hours or generate a new one. Once the extension is connected, it stays connected until you revoke it."
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function revokeExtensionTokens() {
    setIsBusy(true);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/auth/extension/revoke", {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok) {
        setStatusMessage(json.error_message || "Could not revoke extension tokens.");
        return;
      }

      setStatusMessage(`Revoked ${json.revoked ?? 0} extension token(s). Reconnect extension to continue captures.`);
      setExtensionConnectCode(null);
      setExtensionCodeExpiresAt(null);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="card scroll-mt-24 p-4 sm:p-5" id={id}>
      <h2 className="text-lg font-semibold">Chrome Extension</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Install ArticlePod Capture from Chrome Web Store, then generate a one-time connect code that is valid for 24 hours. If you do not
        use it in time, generate a new one. Once you connect the extension, it stays authorized until you revoke it.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <a
          className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-center text-sm font-semibold text-white sm:w-auto"
          href={CHROME_WEB_STORE_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          Add to Chrome (Chrome Web Store)
        </a>
        {isAuthenticated ? (
          <>
            <button className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto" onClick={generateExtensionConnectCode} disabled={isBusy}>
              Generate connect code
            </button>
            <button className="w-full rounded-lg border px-3 py-2 text-sm sm:w-auto" onClick={revokeExtensionTokens} disabled={isBusy}>
              Revoke extension tokens
            </button>
          </>
        ) : (
          <Link className="w-full rounded-lg border px-3 py-2 text-center text-sm sm:w-auto" href={loginHref}>
            Log in to generate connect code
          </Link>
        )}
      </div>
      {isAuthenticated ? (
        extensionConnectCode ? (
          <div className="mt-3">
            <CopyableValueBox
              copiedMessage="Extension connect code copied."
              idleMessage="Tap or click the box to copy the one-time connect code."
              label="One-time connect code (valid for 24 hours)"
              value={extensionConnectCode}
              valueClassName="text-sm"
            />
            <p className="mt-2 text-xs text-[var(--muted)]">
              Expires: {extensionCodeExpiresAt ? new Date(extensionCodeExpiresAt).toLocaleString() : "soon"}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              After this 24-hour window, the code stops working and you must generate a new one. Once the extension connects, that
              installed token does not expire automatically.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Generate a one-time connect code when you are ready to pair the extension. The code only appears here after you request it.
          </p>
        )
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">Connect code stays hidden until you log in</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Public visitors can see the same setup steps, but only signed-in users can generate or copy the one-time connect code.
          </p>
        </div>
      )}
      {statusMessage ? <p className="mt-3 text-sm text-[var(--muted)]">{statusMessage}</p> : null}
    </section>
  );
}
