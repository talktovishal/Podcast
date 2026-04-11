import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShellHeader } from "@/components/app-shell-header";
import { getAuthUserFromCookies } from "@/lib/auth";
import {
  getBillingSettingsState,
  isBillingPlanCheckoutConfigured,
} from "@/lib/billing";

export default async function AppLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  const billingState = await getBillingSettingsState(user.id);
  const billingConfigured =
    isBillingPlanCheckoutConfigured("PRO_MONTHLY") ||
    isBillingPlanCheckoutConfigured("PRO_ANNUAL");

  return (
    <div className="min-h-screen">
      <AppShellHeader
        billingConfigured={billingConfigured}
        initialBilling={billingState.liveBilling}
        sandboxModeActive={billingState.mode.effectiveLane === "SANDBOX"}
        userId={user.id}
      />
      <div className="pt-28 sm:pt-32 lg:pt-24">{children}</div>
    </div>
  );
}
