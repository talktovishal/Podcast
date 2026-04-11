"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  appShellAccentItemClass,
  appShellDangerItemClass,
  appShellNeutralItemClass,
  appShellWarningItemClass,
} from "@/components/app-shell-button-styles";
import { BillingActionButton } from "@/components/billing-action-button";
import { useBillingStatus } from "@/components/use-billing-status";
import type { BillingAccountSnapshot } from "@/lib/billing-contract";

type Props = {
  initialBilling: BillingAccountSnapshot;
  billingConfigured: boolean;
  activationHint?: boolean;
  sandboxModeActive?: boolean;
  variant?: "default" | "header" | "mobile-header";
};

function toneClasses(input: BillingAccountSnapshot) {
  if (input.hasBillingIssue) {
    return {
      action: appShellDangerItemClass,
      message: "border-[#f4c7c3] bg-[#fff5f5] text-[#8a271f]",
    };
  }

  if (input.isPendingActivation) {
    return {
      action: appShellWarningItemClass,
      message: "border-[#d9d0a7] bg-[#fff9e8] text-[#6f5400]",
    };
  }

  if (input.hasPaidAccess || input.accessReason === "complimentary") {
    return {
      action: appShellAccentItemClass,
      message:
        "border-[rgba(31,122,90,0.24)] bg-[rgba(223,243,236,0.32)] text-[var(--ink)]",
    };
  }

  return {
    action: appShellAccentItemClass,
    message:
      "border-[rgba(31,122,90,0.24)] bg-[rgba(223,243,236,0.32)] text-[var(--ink)]",
  };
}

function billingActionLabel(billing: BillingAccountSnapshot): string {
  if (billing.hasBillingIssue) {
    return "Billing issue";
  }
  if (billing.isPendingActivation) {
    return "Activating Pro";
  }
  if (billing.hasPaidAccess || billing.accessReason === "complimentary") {
    return "Pro user";
  }
  return "Upgrade to Pro";
}

function billingConfiguredForPortal(billing: BillingAccountSnapshot): boolean {
  return Boolean(
    billing.customerId &&
    (billing.hasPaidAccess ||
      billing.hasBillingIssue ||
      billing.planCode !== "STARTER" ||
      billing.isPendingActivation),
  );
}

export function WorkspaceBillingSummary({
  initialBilling,
  billingConfigured,
  activationHint = false,
  sandboxModeActive = false,
  variant = "default",
}: Props) {
  const searchParams = useSearchParams();
  const shouldPollForActivation =
    activationHint || searchParams.get("billing") === "success";
  const { billing, pollMessage } = useBillingStatus(
    initialBilling,
    shouldPollForActivation,
  );
  const showPortalAction = billingConfiguredForPortal(billing);
  const tone = toneClasses(billing);
  const message = pollMessage ?? billing.billingIssueMessage;
  const actionLabel = billingActionLabel(billing);

  if (variant === "mobile-header") {
    return (
      <Link
        className={`${appShellAccentItemClass} h-9 min-w-0 max-w-full justify-center px-3 text-sm`}
        href="/app/settings#billing"
      >
        Upgrade to Pro
      </Link>
    );
  }

  if (variant === "header") {
    const compactActionClass = tone.action;

    return (
      <div className="flex flex-wrap items-center gap-2">
        {billing.accessReason === "complimentary" ? (
          <span className={compactActionClass}>{actionLabel}</span>
        ) : showPortalAction ? (
          <BillingActionButton
            action="portal"
            className={compactActionClass}
            label={actionLabel}
          />
        ) : billingConfigured ? (
          <Link className={compactActionClass} href="/app/settings#billing">
            {actionLabel}
          </Link>
        ) : (
          <span className={appShellNeutralItemClass}>Billing unavailable</span>
        )}
        {sandboxModeActive ? (
          <span className={appShellNeutralItemClass}>Sandbox</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {billing.accessReason === "complimentary" ? (
          <span className={tone.action}>{actionLabel}</span>
        ) : showPortalAction ? (
          <BillingActionButton
            action="portal"
            className={tone.action}
            label={actionLabel}
          />
        ) : billingConfigured ? (
          <Link className={tone.action} href="/app/settings#billing">
            {actionLabel}
          </Link>
        ) : (
          <span className={appShellNeutralItemClass}>Billing unavailable</span>
        )}
      </div>

      {message ? (
        <p className={`rounded-lg border px-3 py-2 text-sm ${tone.message}`}>
          {message}
        </p>
      ) : null}
      {sandboxModeActive ? (
        <p className="text-xs text-[var(--muted)]">
          Sandbox billing mode is active in Settings. Live access is shown here.
        </p>
      ) : null}
    </div>
  );
}
