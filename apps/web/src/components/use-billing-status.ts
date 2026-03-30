"use client";

import { useEffect, useState } from "react";
import type { BillingAccountSnapshot } from "@/lib/billing-contract";

type BillingStatusResponse = {
  ok: boolean;
  billing?: BillingAccountSnapshot;
  error_message?: string;
};

const ACTIVATION_POLL_MS = 3000;
const ACTIVATION_POLL_LIMIT = 20;

export function useBillingStatus(initialBilling: BillingAccountSnapshot, activationHint = false) {
  const [billing, setBilling] = useState(initialBilling);
  const [pollMessage, setPollMessage] = useState<string | null>(
    activationHint && !initialBilling.hasPaidAccess
      ? "Payment received. ArticlePod is waiting for Stripe confirmation before unlocking access."
      : null
  );

  const shouldPollActivation = Boolean((activationHint || billing.isPendingActivation) && !billing.hasPaidAccess && billing.customerId);

  useEffect(() => {
    setBilling(initialBilling);
    setPollMessage(
      activationHint && !initialBilling.hasPaidAccess
        ? "Payment received. ArticlePod is waiting for Stripe confirmation before unlocking access."
        : null
    );
  }, [activationHint, initialBilling]);

  useEffect(() => {
    if (!shouldPollActivation) {
      return;
    }

    let active = true;
    let attempts = 0;

    async function pollBillingStatus() {
      attempts += 1;
      try {
        const response = await fetch("/api/billing/status", {
          cache: "no-store"
        });
        const payload = (await response.json()) as BillingStatusResponse;
        if (!active || !response.ok || !payload.ok || !payload.billing) {
          return;
        }

        setBilling(payload.billing);

        if (payload.billing.hasPaidAccess) {
          setPollMessage("Subscription activated. Pro access is ready.");
          active = false;
          return;
        }

        if (!payload.billing.isPendingActivation) {
          setPollMessage(payload.billing.billingIssueMessage ?? null);
          active = false;
          return;
        }

        if (attempts >= ACTIVATION_POLL_LIMIT) {
          setPollMessage("Stripe is still processing this subscription. Refresh this page in a moment or open billing if the state does not update.");
          active = false;
        }
      } catch {
        if (attempts >= ACTIVATION_POLL_LIMIT && active) {
          setPollMessage("Stripe activation is still pending. Refresh this page in a moment to confirm access.");
          active = false;
        }
      }
    }

    void pollBillingStatus();
    const timer = window.setInterval(() => {
      if (active) {
        void pollBillingStatus();
      }
    }, ACTIVATION_POLL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [shouldPollActivation]);

  return {
    billing,
    pollMessage
  };
}
