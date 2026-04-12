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

type ComparisonCell =
  | {
      kind: "text";
      value: string;
    }
  | {
      kind: "included";
    }
  | {
      kind: "upgrade";
      value: string;
    };

type ComparisonRow = {
  feature: string;
  starter: ComparisonCell;
  monthly: ComparisonCell;
  annual: ComparisonCell;
};

const monthlyPlan = paidPlanConfig("PRO_MONTHLY");
const annualPlan = paidPlanConfig("PRO_ANNUAL");
const annualAdvantage = paidPlanCapacityDelta();
const comparisonRows: ReadonlyArray<ComparisonRow> = [
  {
    feature: "Price",
    starter: { kind: "text", value: "$0" },
    monthly: { kind: "text", value: "$15/mo" },
    annual: { kind: "text", value: "$130/yr" }
  },
  {
    feature: "Best for",
    starter: { kind: "text", value: "Trying the workflow" },
    monthly: { kind: "text", value: "Steady weekly use" },
    annual: { kind: "text", value: "Daily or habitual use" }
  },
  {
    feature: "Episode allowance",
    starter: { kind: "text", value: "Limited monthly episodes" },
    monthly: { kind: "text", value: `${monthlyPlan.dailyPodcastLimit} new episodes / day` },
    annual: { kind: "text", value: `${annualPlan.dailyPodcastLimit} new episodes / day` }
  },
  {
    feature: "Personal wiki",
    starter: { kind: "upgrade", value: "Upgrade to Pro Annual" },
    monthly: { kind: "upgrade", value: "Upgrade to Pro Annual" },
    annual: { kind: "included" }
  },
  {
    feature: "Weekly digest podcast + email",
    starter: { kind: "upgrade", value: "Upgrade to Pro" },
    monthly: { kind: "included" },
    annual: { kind: "included" }
  },
  {
    feature: "URL + PDF ingestion",
    starter: { kind: "included" },
    monthly: { kind: "included" },
    annual: { kind: "included" }
  },
  {
    feature: "Private RSS feed",
    starter: { kind: "included" },
    monthly: { kind: "included" },
    annual: { kind: "included" }
  },
  {
    feature: "Chrome extension capture",
    starter: { kind: "included" },
    monthly: { kind: "included" },
    annual: { kind: "included" }
  },
  {
    feature: "Billing cadence",
    starter: { kind: "text", value: "Free" },
    monthly: { kind: "text", value: "Billed monthly" },
    annual: { kind: "text", value: "Billed yearly" }
  },
  {
    feature: "Cancelation behavior",
    starter: { kind: "text", value: "No renewal" },
    monthly: { kind: "text", value: "Cancel anytime" },
    annual: { kind: "text", value: "Cancel anytime" }
  }
] as const;
const trustPoints = [
  "Billed upfront monthly or yearly",
  "Renews automatically until canceled",
  "Cancel anytime; access stays through the current paid period"
] as const;

const pricingDescription =
  `Simple pricing for personal article podcasts. Start free, choose monthly for ${monthlyPlan.dailyPodcastLimit} private podcast episodes per day, or go annual for ${annualPlan.dailyPodcastLimit} per day and nearly 30% savings.`;

export const metadata: Metadata = buildPublicMetadata({
  title: "Pricing for private article podcasts",
  description: pricingDescription,
  path: "/pricing",
  keywords: [
    "articlepod pricing",
    "private podcast feed pricing",
    "article to podcast subscription",
    "article narration pricing"
  ]
});

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M5 12.5 9.5 17 19 7.5" />
    </svg>
  );
}

function UpgradeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

function PlanFeatureItem({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 text-[#1f7a5a]">
        <CheckIcon />
      </span>
      <span>{label}</span>
    </li>
  );
}

function renderComparisonCell(cell: ComparisonCell, emphasis = false) {
  if (cell.kind === "included") {
    return (
      <span
        aria-label="Included"
        className={`inline-flex items-center ${emphasis ? "text-[#155240]" : "text-[#1f7a5a]"}`}
      >
        <CheckIcon />
        <span className="sr-only">Included</span>
      </span>
    );
  }

  if (cell.kind === "upgrade") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(31,122,90,0.12)] bg-white/85 px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
        <UpgradeIcon />
        <span>{cell.value}</span>
      </span>
    );
  }

  return <span>{cell.value}</span>;
}

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

      <section className="space-y-4 rounded-[28px] border border-[rgba(31,122,90,0.12)] bg-[rgba(255,255,255,0.82)] p-5 shadow-[0_18px_40px_rgba(20,38,30,0.07)] sm:p-6">
        <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Choose the ArticlePod plan that fits how you save and learn.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
          Start free and upgrade when you need more daily episodes and digest
          workflows. Pro Annual is where the personal wiki becomes a real
          differentiator, with automatic refreshes that keep your knowledge
          base fresh.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[#cfe7df] bg-[#edf8f5] px-3 py-1.5 text-sm font-medium text-[#155240]">
            Save nearly 30% on annual
          </span>
          <span className="rounded-full border border-[rgba(31,122,90,0.12)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--ink)]">
            {annualPlan.dailyPodcastLimit} episodes/day + wiki auto-refresh
          </span>
        </div>
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
        <article className="card flex h-full flex-col p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">Try the workflow</p>
          <h2 className="mt-3 text-lg font-semibold">Starter</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Private listening basics without a subscription.</p>
          <p className="mt-3 text-2xl font-bold">$0</p>
          <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
            <PlanFeatureItem label="Limited monthly episodes" />
            <PlanFeatureItem label="URL and PDF ingestion" />
            <PlanFeatureItem label="Private RSS feed access" />
          </ul>
          <p className="mt-4 text-sm text-[var(--muted)]">No subscription required.</p>
          <div className="mt-auto pt-6 text-sm text-[var(--muted)]">
            {billing ? (
              <p>
                {billingState?.mode.effectiveLane === "SANDBOX" ? "Live access" : "Current access"}:{" "}
                {billingPlanLabel((billingState?.mode.effectiveLane === "SANDBOX" ? billingState.liveBilling : billing).planCode)} ·{" "}
                {billingStatusLabel((billingState?.mode.effectiveLane === "SANDBOX" ? billingState.liveBilling : billing).status)}
              </p>
            ) : (
              <Link
                className="inline-flex rounded-lg border border-[#bfded4] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-[rgba(247,251,250,0.92)]"
                href={buildLoginHref({ next: "/pricing" })}
              >
                Sign in to start free
              </Link>
            )}
          </div>
          {!billing && !user ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Create an account and start with the free plan right away.
            </p>
          ) : null}
        </article>

        <article className="card flex h-full flex-col border-[#9ad0c0] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">Steady weekly use</p>
          <h2 className="mt-3 text-lg font-semibold">Pro Monthly</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Predictable capacity for regular catch-up sessions.</p>
          <p className="mt-3 text-2xl font-bold">$15/mo</p>
          <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
            <PlanFeatureItem label={`${monthlyPlan.dailyPodcastLimit} new podcast episodes per day`} />
            <PlanFeatureItem label="Chrome extension capture" />
            <PlanFeatureItem label="Weekly digest podcast + email options" />
          </ul>
          <p className="mt-4 text-sm text-[var(--muted)]">Billed upfront monthly. Renews automatically until canceled.</p>
          <div className="mt-auto pt-6">
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

        <article className="card flex h-full flex-col border-[#8fcdbb] bg-[#f4fbf8] p-5 shadow-[0_16px_32px_rgba(20,38,30,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1f7a5a]">Daily or habitual use</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Pro Annual</h2>
            <span className="rounded-full border border-[#cfe7df] bg-[#edf8f5] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1f7a5a]">
              Wiki plan
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">The strongest fit when you want the personal wiki to be a core part of why you upgrade.</p>
          <div className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-1">
            <p className="text-2xl font-bold">$130/yr</p>
            <p className="text-sm font-medium text-[#1f7a5a]">Save nearly 30%</p>
          </div>
          <p className="mt-2 rounded-lg border border-[#cfe7df] bg-[#edf8f5] px-3 py-2 text-sm text-[#155240]">
            Includes +{annualAdvantage.extraDailyPodcasts} daily episodes versus monthly, plus the annual-only personal wiki that automatically refreshes.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
            <PlanFeatureItem label={`${annualPlan.dailyPodcastLimit} new podcast episodes per day`} />
            <PlanFeatureItem label="Chrome extension capture" />
            <PlanFeatureItem label="Personal wiki access" />
            <PlanFeatureItem label="Personal wiki automatically refreshes" />
            <PlanFeatureItem label="Weekly digest podcast + email options" />
          </ul>
          <p className="mt-4 text-sm text-[var(--muted)]">Billed upfront yearly. Renews automatically until canceled.</p>
          <div className="mt-auto pt-6">
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

      <section className="mt-8 space-y-4">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold sm:text-xl">Compare plans at a glance</h2>
          <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Scan the key differences side by side, then choose the level of listening capacity you want.
          </p>
        </div>
        <div className="card overflow-x-auto">
          <table className="min-w-[720px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[rgba(31,122,90,0.12)] text-[var(--muted)]">
                <th className="px-4 py-3 font-semibold" scope="col">
                  Feature
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Starter
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Pro Monthly
                </th>
                <th className="bg-[rgba(237,248,245,0.8)] px-4 py-3 font-semibold text-[#155240]" scope="col">
                  Pro Annual
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr className="border-b border-[rgba(31,122,90,0.08)] last:border-b-0" key={row.feature}>
                  <th className="px-4 py-3 font-semibold text-[var(--ink)]" scope="row">
                    {row.feature}
                  </th>
                  <td className="px-4 py-3 text-[var(--muted)]">{renderComparisonCell(row.starter)}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{renderComparisonCell(row.monthly)}</td>
                  <td className="bg-[rgba(237,248,245,0.45)] px-4 py-3 font-medium text-[#155240]">
                    {renderComparisonCell(row.annual, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 card p-5">
        <h2 className="text-lg font-semibold">What to expect</h2>
        <ul className="mt-4 grid gap-3 text-sm text-[var(--muted)] sm:grid-cols-3">
          {trustPoints.map((point) => (
            <li
              className="rounded-2xl border border-[rgba(31,122,90,0.1)] bg-[rgba(247,251,250,0.86)] px-4 py-3"
              key={point}
            >
              {point}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
