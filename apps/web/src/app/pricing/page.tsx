import type { Metadata } from "next";
import { BillingActionButton } from "@/components/billing-action-button";
import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";
import { billingPlanLabel, billingStatusLabel, getBillingAccountSnapshot, isBillingCheckoutConfigured } from "@/lib/billing";
import { getAuthUserFromCookies } from "@/lib/auth";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple pricing for personal article podcasts. Start free or upgrade to Pro for $15 per month.",
  alternates: { canonical: "/pricing" }
};

export default async function PricingPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const user = await getAuthUserFromCookies();
  const billing = user ? await getBillingAccountSnapshot(user.id) : null;
  const billingConfigured = isBillingCheckoutConfigured();
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
            Start free. Upgrade when you want more captures, episodes, and daily briefings.
          </p>
          {billingSearchParam === "canceled" ? (
            <p className="max-w-2xl rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[var(--muted)]">
              Checkout was canceled before completion. Your current access level has not changed.
            </p>
          ) : null}
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
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
                  Current access: {billingPlanLabel(billing.planCode)} · {billingStatusLabel(billing.status)}
                </p>
              ) : (
                <p>Sign in to start with the free plan instantly.</p>
              )}
            </div>
          </article>

          <article className="card border-[#9ad0c0] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1f7a5a]">Recommended</p>
            <h2 className="mt-1 text-lg font-semibold">Pro</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">For regular use.</p>
            <p className="mt-3 text-2xl font-bold">$15/mo</p>
            <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
              <li>- Higher monthly ingest + episode limits</li>
              <li>- Chrome extension capture</li>
              <li>- Daily podcast + email briefing</li>
            </ul>
            <p className="mt-4 text-sm text-[var(--muted)]">Billed upfront monthly. Renews automatically until canceled.</p>
            <div className="mt-4">
              {!user ? (
                <Link className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white" href="/login">
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
              ) : billingConfigured ? (
                <BillingActionButton
                  action="checkout"
                  className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  label="Upgrade to Pro"
                />
              ) : (
                <p className="text-sm text-[var(--muted)]">Billing setup is not configured in this environment yet.</p>
              )}
            </div>
          </article>
        </section>

        <section className="mt-8 card p-5">
          <h2 className="text-lg font-semibold">Billing policy</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li>- Billed upfront monthly.</li>
            <li>- Renews automatically until canceled.</li>
            <li>- Cancel anytime. Access stays on through the current billing period.</li>
            <li>- Annual billing is not offered yet.</li>
          </ul>
        </section>

        <section className="mt-8 card p-5">
          <h2 className="text-lg font-semibold">Capacity, cost, and margins</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Cost modeling uses your Azure baseline and configurable usage knobs (articles/day, average length, retries, VM count,
            egress, and reservations). See the{" "}
            <Link className="underline" href="/resources#cost-model">
              cost model details
            </Link>{" "}
            for the full assumption framework.
          </p>
        </section>

        <MarketingCta />
      </div>
    </main>
  );
}
