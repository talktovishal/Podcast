"use client";

import Link from "next/link";
import { BillingActionButton } from "@/components/billing-action-button";
import { useBillingStatus } from "@/components/use-billing-status";
import { billingPlanLabel, type BillingAccountSnapshot } from "@/lib/billing-contract";

type Props = {
  initialBilling: BillingAccountSnapshot;
  billingConfigured: boolean;
  activationHint?: boolean;
  sandboxModeActive?: boolean;
};

function toneClasses(input: BillingAccountSnapshot) {
  if (input.hasBillingIssue) {
    return {
      pill: "border-[#f4c7c3] bg-[#fff5f5] text-[#8a271f]",
      dot: "bg-[#d14334]",
      message: "border-[#f4c7c3] bg-[#fff5f5] text-[#8a271f]"
    };
  }

  if (input.isPendingActivation) {
    return {
      pill: "border-[#d9d0a7] bg-[#fff9e8] text-[#6f5400]",
      dot: "bg-[#c49817]",
      message: "border-[#d9d0a7] bg-[#fff9e8] text-[#6f5400]"
    };
  }

  if (input.hasPaidAccess) {
    return {
      pill: "border-[#c9e4dc] bg-[#edf8f5] text-[#0f6a54]",
      dot: "bg-[#14a37f]",
      message: "border-[#c9e4dc] bg-[#edf8f5] text-[#0f6a54]"
    };
  }

  return {
    pill: "border-slate-200 bg-slate-50 text-slate-700",
    dot: "bg-slate-400",
    message: "border-slate-200 bg-slate-50 text-slate-700"
  };
}

function billingHeadline(billing: BillingAccountSnapshot): string {
  if (billing.accessReason === "complimentary") {
    return "Complimentary Pro";
  }
  if (billing.hasPaidAccess || billing.planCode !== "STARTER") {
    return billingPlanLabel(billing.planCode);
  }
  return "Starter";
}

function billingSubcopy(billing: BillingAccountSnapshot): string {
  const periodEndLabel = billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd).toLocaleDateString() : null;

  if (billing.accessReason === "complimentary") {
    return "Admin managed";
  }
  if (billing.hasBillingIssue) {
    return "Payment issue";
  }
  if (billing.isPendingActivation) {
    return "Activating";
  }
  if (billing.cancelAtPeriodEnd && periodEndLabel) {
    return `Ends ${periodEndLabel}`;
  }
  if (billing.hasPaidAccess && periodEndLabel) {
    return `Renews ${periodEndLabel}`;
  }
  if (billing.hasPaidAccess) {
    return "Active";
  }
  return "Free";
}

export function WorkspaceBillingSummary({
  initialBilling,
  billingConfigured,
  activationHint = false,
  sandboxModeActive = false
}: Props) {
  const { billing, pollMessage } = useBillingStatus(initialBilling, activationHint);
  const showPortalAction = Boolean(
    billing.customerId && (billing.hasPaidAccess || billing.hasBillingIssue || billing.planCode !== "STARTER" || billing.isPendingActivation)
  );
  const tone = toneClasses(billing);
  const message = pollMessage ?? billing.billingIssueMessage;
  const portalLabel = `Billing · ${billingHeadline(billing)}${billingSubcopy(billing) ? ` · ${billingSubcopy(billing)}` : ""}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {billing.accessReason === "complimentary" ? (
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${tone.pill}`}>
            <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden />
            <span>{portalLabel}</span>
          </span>
        ) : showPortalAction ? (
          <BillingActionButton
            action="portal"
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${tone.pill}`}
            label={portalLabel}
          />
        ) : billingConfigured ? (
          <Link
            className="inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-slate-300 hover:bg-slate-50"
            href="/pricing"
          >
            Upgrade to Pro
          </Link>
        ) : (
          <span className="text-xs text-[var(--muted)]">Billing setup pending.</span>
        )}
      </div>

      {message ? <p className={`rounded-lg border px-3 py-2 text-sm ${tone.message}`}>{message}</p> : null}
      {sandboxModeActive ? (
        <p className="text-xs text-[var(--muted)]">Sandbox billing mode is active in Settings. Live access is shown here.</p>
      ) : null}
    </div>
  );
}
