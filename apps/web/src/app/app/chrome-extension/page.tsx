import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShellNav } from "@/components/app-shell-nav";
import { ChromeExtensionGuidePanels } from "@/components/chrome-extension-guide-panels";
import { ChromeExtensionSetupCard } from "@/components/chrome-extension-setup-card";
import { WorkspaceBillingSummary } from "@/components/workspace-billing-summary";
import { getAuthUserFromCookies } from "@/lib/auth";
import {
  getBillingSettingsState,
  isBillingPlanCheckoutConfigured,
} from "@/lib/billing";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ChromeExtensionPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }
  const billingState = await getBillingSettingsState(user.id);
  const billingConfigured =
    isBillingPlanCheckoutConfigured("PRO_MONTHLY") ||
    isBillingPlanCheckoutConfigured("PRO_ANNUAL");

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <WorkspaceBillingSummary
                billingConfigured={billingConfigured}
                initialBilling={billingState.liveBilling}
                sandboxModeActive={
                  billingState.mode.effectiveLane === "SANDBOX"
                }
              />
              <AppShellNav current="chrome-extension" userId={user.id} />
            </div>
            <div className="space-y-1">
              <h1 className="font-bold text-2xl">Chrome Extension</h1>
              <p className="text-sm text-[var(--muted)]">
                Install it from the Chrome Web Store, copy the ready connect
                code, and pair the extension once.
              </p>
            </div>
          </div>
        </header>

        <ChromeExtensionSetupCard id="chrome-extension" isAuthenticated />
        <ChromeExtensionGuidePanels />
      </div>
    </main>
  );
}
