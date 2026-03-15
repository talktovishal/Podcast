"use client";

import { useState } from "react";

type Props = {
  action: "checkout" | "portal";
  planCode?: "PRO_MONTHLY";
  className?: string;
  label: string;
  disabled?: boolean;
};

type BillingResponse = {
  ok: boolean;
  url?: string;
  error_message?: string;
};

export function BillingActionButton({ action, planCode = "PRO_MONTHLY", className, label, disabled = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/billing/${action}`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: action === "checkout" ? JSON.stringify({ planCode }) : "{}"
      });
      const payload = (await response.json()) as BillingResponse;

      if (!response.ok || !payload.ok || !payload.url) {
        setMessage(payload.error_message || "Billing request failed.");
        return;
      }

      window.location.assign(payload.url);
    } catch {
      setMessage("Billing request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button className={className} disabled={disabled || busy} onClick={handleClick} type="button">
        {busy ? "Opening..." : label}
      </button>
      {message ? <p className="text-xs text-[var(--danger)]">{message}</p> : null}
    </div>
  );
}
