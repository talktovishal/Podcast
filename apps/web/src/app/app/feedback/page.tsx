import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShellNav } from "@/components/app-shell-nav";
import { FeedbackForm } from "@/components/feedback-form";
import { WorkspaceBillingSummary } from "@/components/workspace-billing-summary";
import { getAuthUserFromCookies } from "@/lib/auth";
import {
  getBillingSettingsState,
  isBillingPlanCheckoutConfigured,
} from "@/lib/billing";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function FeedbackPage() {
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
              <AppShellNav current="feedback" userId={user.id} />
            </div>
            <div>
              <h1 className="font-bold text-2xl">Feedback</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Share ideas, report bugs, and suggest improvements.
              </p>
            </div>
          </div>
        </header>

        <FeedbackForm />
      </div>
    </main>
  );
}
