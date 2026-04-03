import type { Metadata } from "next";
import { BillingActionButton } from "@/components/billing-action-button";
import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";
import { buildLoginHref } from "@/lib/auth-redirect";
import {
  billingPlanLabel,
  billingStatusLabel,
  getBillingSettingsState,
  isBillingPlanCheckoutConfigured
} from "@/lib/billing";
import { getAuthUserFromCookies } from "@/lib/auth";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple pricing for personal article podcasts. Start free or upgrade to Pro for $15 monthly or $130 annually.",
  alternates: { canonical: "/pricing" }
};

export default async function PricingPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const user = await getAuthUserFromCookies();
  const billingState = user ? await getBillingSettingsState(user.id) : null;
  const billing = billingState?.selectedBilling ?? null;
  const monthlyCheckoutConfigured = isBillingPlanCheckoutConfigured("PRO_MONTHLY", billingState?.mode.effectiveLane ?? "LIVE");
  const annualCheckoutConfigured = isBillingPlanCheckoutConfigured("PRO_ANNUAL", billingState?.mode.effectiveLane ?? "LIVE");
  const billingSearchParam = Array.isArray(searchParams?.billing) ? searchParams?.billing[0] : searchParams?.billing;

  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="container-shell">
        <MarketingHeader activeHref="/pricing" />
        <section className="space-y-4">
          <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
            Pricing
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">Simple pricing for personal listening</h1>
          <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
            Start free. Upgrade to Pro when you want higher limits, manual summaries, and weekly digest workflows.
          </p>
          {billingState?.mode.effectiveLane === "SANDBOX" ? (
            <p className="max-w-2xl rounded-lg border border-[#d9d0a7] bg-[#fff9e8] px-4 py-3 text-sm text-[#6f5400]">
              Sandbox billing active for testing. Live access and quotas still follow your live subscription.
            </p>
          ) : null}
          {billingSearchParam === "canceled" ? (
            <p className="max-w-2xl rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[var(--muted)]">
              Checkout was canceled before completion. Your current access level has not changed.
            </p>
          ) : null}
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          <article className="card p-5">
            <h2 className="text-lg font-semibold">Starter</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">For trying it out.</p>
            <p className="mt-3 text-2xl font-bold">$0</p>
            <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
              <li>- Limited monthly episodes</li>
              <li>- URL and PDF ingestion</li>
              <li>- Private RSS feed access</li>
            </ul>
            <div className="mt-4 text-sm text-[var(--muted)]">
              {billing ? (
                <p>
                  {billingState?.mode.effectiveLane === "SANDBOX" ? "Live access" : "Current access"}:{" "}
                  {billingPlanLabel((billingState?.mode.effectiveLane === "SANDBOX" ? billingState.liveBilling : billing).planCode)} ·{" "}
                  {billingStatusLabel((billingState?.mode.effectiveLane === "SANDBOX" ? billingState.liveBilling : billing).status)}
                </p>
              ) : (
                <p>Sign in to start with the free plan instantly.</p>
              )}
            </div>
          </article>

          <article className="card border-[#9ad0c0] p-5">
            <h2 className="text-lg font-semibold">Pro Monthly</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">For regular use.</p>
            <p className="mt-3 text-2xl font-bold">$15/mo</p>
            <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
              <li>- 15 new private podcast episodes per 24 hours</li>
              <li>- 5 manual summaries per 7 days</li>
              <li>- Chrome extension capture</li>
              <li>- Weekly digest podcast + email options</li>
            </ul>
            <p className="mt-4 text-sm text-[var(--muted)]">Billed upfront monthly. Renews automatically until canceled.</p>
            <div className="mt-4">
              {!user ? (
                <Link
                  className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                  href={buildLoginHref({ next: "/pricing" })}
                >
                  Sign in to upgrade
                </Link>
              ) : billing?.accessReason === "complimentary" ? (
                <Link className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white" href="/app/settings">
                  View current access
                </Link>
              ) : billing?.customerId ? (
                <Link className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white" href="/app/settings">
                  Manage billing
                </Link>
              ) : monthlyCheckoutConfigured ? (
                <BillingActionButton
                  action="checkout"
                  planCode="PRO_MONTHLY"
                  className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  label="Choose monthly"
                />
              ) : (
                <p className="text-sm text-[var(--muted)]">Billing setup is not configured in this environment yet.</p>
              )}
            </div>
          </article>

          <article className="card border-[#9ad0c0] bg-[#f8fcfb] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1f7a5a]">Best value</p>
            <h2 className="mt-1 text-lg font-semibold">Pro Annual</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">For committed use.</p>
            <p className="mt-3 text-2xl font-bold">$130/yr</p>
            <p className="mt-1 text-sm font-medium text-[#1f7a5a]">Save nearly 30%</p>
            <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
              <li>- 15 new private podcast episodes per 24 hours</li>
              <li>- 5 manual summaries per 7 days</li>
              <li>- Chrome extension capture</li>
              <li>- Weekly digest podcast + email options</li>
            </ul>
            <p className="mt-4 text-sm text-[var(--muted)]">Billed upfront yearly. Renews automatically until canceled.</p>
            <div className="mt-4">
              {!user ? (
                <Link
                  className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                  href={buildLoginHref({ next: "/pricing" })}
                >
                  Sign in to upgrade
                </Link>
              ) : billing?.accessReason === "complimentary" ? (
                <Link className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white" href="/app/settings">
                  View current access
                </Link>
              ) : billing?.customerId ? (
                <Link className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white" href="/app/settings">
                  Manage billing
                </Link>
              ) : annualCheckoutConfigured ? (
                <BillingActionButton
                  action="checkout"
                  planCode="PRO_ANNUAL"
                  className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  label="Choose annual"
                />
              ) : (
                <p className="text-sm text-[var(--muted)]">Annual billing is not configured in this environment yet.</p>
              )}
            </div>
          </article>
        </section>

        <section className="mt-8 card p-5">
          <h2 className="text-lg font-semibold">Billing policy</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li>- Billed upfront monthly or yearly.</li>
            <li>- Renews automatically until canceled.</li>
            <li>- Cancel anytime. Access stays on through the current paid period.</li>
            <li>- Annual plans stay active through the paid term, then stop renewing.</li>
          </ul>
        </section>

        <MarketingCta />
      </div>
    </main>
  );
}
