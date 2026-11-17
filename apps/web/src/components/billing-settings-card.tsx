"use client";

import { useState } from "react";
import { BillingActionButton } from "@/components/billing-action-button";
import { useBillingStatus } from "@/components/use-billing-status";
import {
  billingPaymentStatusLabel,
  billingPlanLabel,
  billingStatusLabel,
  type BillingLane,
  type BillingSettingsState
} from "@/lib/billing-contract";

type Props = {
  initialState: BillingSettingsState;
  monthlyCheckoutConfigured: boolean;
  annualCheckoutConfigured: boolean;
  activationHint?: boolean;
  annualPitch: {
    dailyPodcastLimit: number;
    dailySummaryLimit: number;
    weeklySummaryLimit: number;
    extraDailyPodcasts: number;
    extraWeeklySummaries: number;
  };
};

export function BillingSettingsCard({
  initialState,
  monthlyCheckoutConfigured,
  annualCheckoutConfigured,
  activationHint = false,
  annualPitch
}: Props) {
  const { billing, pollMessage } = useBillingStatus(initialState.selectedBilling, activationHint, "selected");
  const [modeBusy, setModeBusy] = useState(false);
  const [modeMessage, setModeMessage] = useState<string | null>(null);
  const liveBilling = initialState.liveBilling;
  const sandboxActive = initialState.mode.effectiveLane === "SANDBOX";
  const showPortalAction = Boolean(
    billing.customerId && (billing.hasPaidAccess || billing.hasBillingIssue || billing.planCode !== "STARTER" || billing.isPendingActivation)
  );

  const periodEndLabel = billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd).toLocaleDateString() : null;
  const statusToneClass = billing.hasBillingIssue
    ? "border-[#f4c7c3] bg-[#fff5f5] text-[#8a271f]"
    : billing.isPendingActivation
      ? "border-[#d9d0a7] bg-[#fff9e8] text-[#6f5400]"
      : billing.hasPaidAccess
        ? "border-[#c9e4dc] bg-[#edf8f5] text-[#0f6a54]"
        : "border-slate-200 bg-slate-50 text-slate-700";

  async function updateLane(lane: BillingLane) {
    if (modeBusy) {
      return;
    }

    setModeBusy(true);
    setModeMessage(null);
    try {
      const response = await fetch("/api/billing/mode", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ lane })
      });
      const payload = (await response.json()) as { ok?: boolean; error_message?: string };
      if (!response.ok || !payload.ok) {
        setModeMessage(payload.error_message || "Could not update billing mode.");
        return;
      }
      window.location.reload();
    } catch {
      setModeMessage("Could not update billing mode.");
    } finally {
      setModeBusy(false);
    }
  }

  return (
    <section className="card scroll-mt-24 p-4 sm:p-5" id="billing">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Billing</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {sandboxActive
                ? `Sandbox billing: ${billingPlanLabel(billing.planCode)} · ${billingStatusLabel(billing.status)}`
                : `Current access: ${
                    billing.accessReason === "complimentary" ? "Complimentary Pro" : billingPlanLabel(billing.planCode)
                  } · ${billingStatusLabel(billing.status)}`}
            </p>
          </div>

          {initialState.mode.canUseSandbox ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[var(--ink)]">Billing mode</span>
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      initialState.mode.effectiveLane === "LIVE" ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"
                    }`}
                    disabled={modeBusy}
                    onClick={() => updateLane("LIVE")}
                    type="button"
                  >
                    Live billing
                  </button>
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      sandboxActive ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"
                    }`}
                    disabled={modeBusy}
                    onClick={() => updateLane("SANDBOX")}
                    type="button"
                  >
                    Sandbox billing
                  </button>
                </div>
              </div>
              {sandboxActive ? (
                <p className="rounded-lg border border-[#d9d0a7] bg-[#fff9e8] px-3 py-2 text-sm text-[#6f5400]">
                  Sandbox billing active for testing. Live access and quotas still follow your live subscription.
                </p>
              ) : null}
              {modeMessage ? <p className="text-sm text-[var(--danger)]">{modeMessage}</p> : null}
            </div>
          ) : null}

          {sandboxActive ? (
            <p className="text-sm text-[var(--muted)]">
              Live access remains {billingPlanLabel(liveBilling.planCode)} · {billingStatusLabel(liveBilling.status)}.
            </p>
          ) : null}

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

          {!billing.accessReason && showPortalAction ? (
            <p className="text-sm text-[var(--muted)]">
              Billing history, payment methods, and invoices are managed in the hosted Stripe portal.
            </p>
          ) : null}
        </div>

        <div className="w-full sm:w-auto">
          {billing.accessReason === "complimentary" ? (
            <p className="text-sm text-[var(--muted)]">Complimentary access is managed by an admin, not through Stripe.</p>
          ) : showPortalAction ? (
            <BillingActionButton
              action="portal"
              className="w-full rounded-lg border px-4 py-2 text-sm font-semibold sm:w-auto"
              label={billing.hasBillingIssue ? "Open billing to fix payment" : "Manage billing"}
            />
          ) : monthlyCheckoutConfigured || annualCheckoutConfigured ? (
            <div className="space-y-2 sm:min-w-[220px]">
              {annualCheckoutConfigured ? (
                <p className="rounded-lg border border-[#cfe7df] bg-[#edf8f5] px-3 py-2 text-sm text-[#155240]">
                  Pro Annual is the best value: save nearly 30%, get {annualPitch.dailyPodcastLimit} new private podcast episodes
                  per 24 hours, {annualPitch.dailySummaryLimit} summary-mode items per 24 hours, and {annualPitch.weeklySummaryLimit} manual summaries every 7 days.
                </p>
              ) : null}
              {annualCheckoutConfigured ? (
                <BillingActionButton
                  action="checkout"
                  planCode="PRO_ANNUAL"
                  className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  label="Choose Pro Annual"
                />
              ) : null}
              {monthlyCheckoutConfigured ? (
                <BillingActionButton
                  action="checkout"
                  planCode="PRO_MONTHLY"
                  className="w-full rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  label="Choose Pro Monthly"
                />
              ) : null}
              {annualCheckoutConfigured && monthlyCheckoutConfigured ? (
                <p className="text-xs text-[var(--muted)]">
                  Annual adds {annualPitch.extraDailyPodcasts} extra daily episode slot
                  {annualPitch.extraDailyPodcasts === 1 ? "" : "s"} and {annualPitch.extraWeeklySummaries} more manual
                  summaries than monthly.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Billing setup is not configured in this environment yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
