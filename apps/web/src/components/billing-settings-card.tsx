"use client";

import { useEffect, useState } from "react";
import {
  BillingActionButton
} from "@/components/billing-action-button";
import {
  billingPaymentStatusLabel,
  billingPlanLabel,
  billingStatusLabel,
  type BillingAccountSnapshot
} from "@/lib/billing-contract";

type Props = {
  initialBilling: BillingAccountSnapshot;
  billingConfigured: boolean;
  activationHint?: boolean;
};

type BillingStatusResponse = {
  ok: boolean;
  billing?: BillingAccountSnapshot;
  error_message?: string;
};

const ACTIVATION_POLL_MS = 3000;
const ACTIVATION_POLL_LIMIT = 20;

export function BillingSettingsCard({ initialBilling, billingConfigured, activationHint = false }: Props) {
  const [billing, setBilling] = useState(initialBilling);
  const [pollMessage, setPollMessage] = useState<string | null>(
    activationHint && !initialBilling.hasPaidAccess
      ? "Payment received. ArticlePod is waiting for Stripe webhook confirmation before unlocking access."
      : null
  );

  const shouldPollActivation = Boolean((activationHint || billing.isPendingActivation) && !billing.hasPaidAccess && billing.customerId);

  useEffect(() => {
    setBilling(initialBilling);
  }, [initialBilling]);

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

  const periodEndLabel = billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd).toLocaleDateString() : null;
  const statusToneClass = billing.hasBillingIssue
    ? "border-[#f4c7c3] bg-[#fff5f5] text-[#8a271f]"
    : billing.isPendingActivation
      ? "border-[#d9d0a7] bg-[#fff9e8] text-[#6f5400]"
      : billing.hasPaidAccess
        ? "border-[#c9e4dc] bg-[#edf8f5] text-[#0f6a54]"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div>
            <h2 className="text-lg font-semibold">Billing</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Current access: {billing.accessReason === "complimentary" ? "Complimentary Pro" : billingPlanLabel(billing.planCode)} ·{" "}
              {billingStatusLabel(billing.status)}
            </p>
          </div>

          {periodEndLabel ? (
            <p className="text-sm text-[var(--muted)]">
              {billing.cancelAtPeriodEnd ? "Access ends on" : "Current billing period renews on"} {periodEndLabel}.
            </p>
          ) : null}

          {billing.lastPaymentStatus !== "NONE" ? (
            <p className="text-sm text-[var(--muted)]">Latest invoice state: {billingPaymentStatusLabel(billing.lastPaymentStatus)}.</p>
          ) : null}

          {billing.accessReason === "complimentary" ? (
            <p className="text-sm text-[var(--muted)]">This account currently has complimentary Pro access managed by an admin.</p>
          ) : null}

          {pollMessage ? (
            <p className={`rounded-lg border px-3 py-2 text-sm ${statusToneClass}`}>{pollMessage}</p>
          ) : billing.billingIssueMessage ? (
            <p className={`rounded-lg border px-3 py-2 text-sm ${statusToneClass}`}>{billing.billingIssueMessage}</p>
          ) : null}

          {!billing.accessReason && billing.customerId ? (
            <p className="text-sm text-[var(--muted)]">
              Billing history, payment methods, and invoices are managed in the hosted Stripe portal.
            </p>
          ) : null}
        </div>

        <div className="w-full sm:w-auto">
          {billing.accessReason === "complimentary" ? (
            <p className="text-sm text-[var(--muted)]">Complimentary access is managed by an admin, not through Stripe.</p>
          ) : billing.customerId ? (
            <BillingActionButton
              action="portal"
              className="w-full rounded-lg border px-4 py-2 text-sm font-semibold sm:w-auto"
              label={billing.hasBillingIssue ? "Open billing to fix payment" : "Manage billing"}
            />
          ) : billingConfigured ? (
            <BillingActionButton
              action="checkout"
              className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
              label="Upgrade to Pro"
            />
          ) : (
            <p className="text-sm text-[var(--muted)]">Billing setup is not configured in this environment yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
