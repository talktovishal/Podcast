import type { Metadata } from "next";
import Link from "next/link";
import { BillingActionButton } from "@/components/billing-action-button";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { getAuthUserFromCookies } from "@/lib/auth";
import { buildLoginHref } from "@/lib/auth-redirect";
import {
  billingPlanLabel,
  billingStatusLabel,
  getBillingSettingsState,
  isBillingPlanCheckoutConfigured
} from "@/lib/billing";
import {
  buildBreadcrumbSchema,
  buildPublicMetadata,
  buildSoftwareApplicationSchema
} from "@/lib/seo";
import { paidPlanCapacityDelta, paidPlanConfig } from "@/lib/paid-plan-config";

const monthlyPlan = paidPlanConfig("PRO_MONTHLY");
const annualPlan = paidPlanConfig("PRO_ANNUAL");
const annualAdvantage = paidPlanCapacityDelta();

const pricingDescription =
  `Simple pricing for personal article podcasts. Start free, choose monthly for ${monthlyPlan.dailyPodcastLimit} private podcast episodes per day, or go annual for ${annualPlan.dailyPodcastLimit} per day, ${annualPlan.weeklySummaryLimit} manual summaries every 7 days, and nearly 30% savings.`;

export const metadata: Metadata = buildPublicMetadata({
  title: "Pricing",
  description: pricingDescription,
  path: "/pricing",
  keywords: [
    "articlepod pricing",
    "private podcast feed pricing",
    "article to podcast subscription",
    "article narration pricing"
  ]
});

export default async function PricingPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const user = await getAuthUserFromCookies();
  const billingState = user ? await getBillingSettingsState(user.id) : null;
  const billing = billingState?.selectedBilling ?? null;
  const monthlyCheckoutConfigured = isBillingPlanCheckoutConfigured(
    "PRO_MONTHLY",
    billingState?.mode.effectiveLane ?? "LIVE"
  );
  const annualCheckoutConfigured = isBillingPlanCheckoutConfigured(
    "PRO_ANNUAL",
    billingState?.mode.effectiveLane ?? "LIVE"
  );
  const billingSearchParam = Array.isArray(searchParams?.billing) ? searchParams?.billing[0] : searchParams?.billing;

  return (
    <>
      <SeoJsonLd
        data={[
          buildSoftwareApplicationSchema(pricingDescription),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Pricing", path: "/pricing" }
          ])
        ]}
      />

      <section className="space-y-4">
        <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">Simple pricing for personal listening</h1>
        <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
          Start free. Upgrade to Pro when you want manual summaries and weekly digest workflows. Annual gives you the
          better rate plus more room to publish and summarize.
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
          <p className="mt-1 text-sm text-[var(--muted)]">For steady weekly use.</p>
          <p className="mt-3 text-2xl font-bold">$15/mo</p>
          <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
            <li>- {monthlyPlan.dailyPodcastLimit} new private podcast episodes per 24 hours</li>
            <li>- {monthlyPlan.weeklySummaryLimit} manual summaries per 7 days</li>
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
              <Link
                className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                href="/app/settings"
              >
                View current access
              </Link>
            ) : billing?.customerId ? (
              <Link
                className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                href="/app/settings"
              >
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
          <p className="mt-1 text-sm text-[var(--muted)]">For committed, high-frequency use.</p>
          <p className="mt-3 text-2xl font-bold">$130/yr</p>
          <p className="mt-1 text-sm font-medium text-[#1f7a5a]">Save nearly 30%</p>
          <p className="mt-2 rounded-lg border border-[#cfe7df] bg-[#edf8f5] px-3 py-2 text-sm text-[#155240]">
            Plus {annualAdvantage.extraDailyPodcasts} extra daily episode slot
            {annualAdvantage.extraDailyPodcasts === 1 ? "" : "s"} and {annualAdvantage.extraWeeklySummaries} more manual
            summaries than monthly.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
            <li>- {annualPlan.dailyPodcastLimit} new private podcast episodes per 24 hours</li>
            <li>- {annualPlan.weeklySummaryLimit} manual summaries per 7 days</li>
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
              <Link
                className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                href="/app/settings"
              >
                View current access
              </Link>
            ) : billing?.customerId ? (
              <Link
                className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                href="/app/settings"
              >
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

      <section className="mt-8 rounded-2xl border border-[#cfe7df] bg-[#edf8f5] p-5">
        <h2 className="text-lg font-semibold">Why Pro Annual wins</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#155240]">
          Annual is designed for people who expect ArticlePod to be part of their regular routine. You save nearly 30%,
          keep the higher {annualPlan.dailyPodcastLimit}-episode daily capacity, and get {annualPlan.weeklySummaryLimit}
          manual summaries every 7 days instead of {monthlyPlan.weeklySummaryLimit}.
        </p>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <article className="card p-5">
          <h2 className="text-lg font-semibold">Who Starter is for</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Starter is the best path if you want to test private article podcasts with real reading. You can save a few sources, hear
            the end-to-end workflow, and decide later whether you need higher volume or digest features.
          </p>
        </article>
        <article className="card p-5">
          <h2 className="text-lg font-semibold">Why annual stands out</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Monthly is the lighter paid entry. Pro Annual is the stronger fit when the private RSS feed becomes part of your
            weekly routine and you want the best rate, the full {annualPlan.dailyPodcastLimit}-episode daily allowance, and
            {annualPlan.weeklySummaryLimit} manual summaries every 7 days.
          </p>
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
    </>
  );
}
