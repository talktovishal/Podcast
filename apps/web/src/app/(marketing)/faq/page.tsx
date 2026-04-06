import type { Metadata } from "next";
import { FaqExplorer } from "@/components/faq-explorer";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { env } from "@/lib/env";
import {
  buildFaqPageContent,
  flattenFaqQuestionsForSchema,
} from "@/lib/faq-page-content";
import {
  buildBreadcrumbSchema,
  buildFaqPageSchema,
  buildPublicMetadata
} from "@/lib/seo";

const faqContent = buildFaqPageContent({
  freeTrialSubmissionLimit: env.freeTrialSubmissionLimit,
  proMonthlyDailyPodcastLimit: env.proMonthlyDailyPodcastLimit,
  proMonthlyWeeklySummaryLimit: env.proMonthlyWeeklySummaryLimit,
  proAnnualDailyPodcastLimit: env.proAnnualDailyPodcastLimit,
  proAnnualWeeklySummaryLimit: env.proAnnualWeeklySummaryLimit,
});

const faqDescription = faqContent.description;

export const metadata: Metadata = buildPublicMetadata({
  title: "ArticlePod FAQ",
  description: faqDescription,
  path: "/faq",
  keywords: [
    "articlepod faq",
    "private podcast feed faq",
    "listen to articles faq"
  ]
});

const faqSchemaItems = flattenFaqQuestionsForSchema(faqContent.sections);

export default function FaqPage() {
  return (
    <>
      <SeoJsonLd
        data={[
          buildFaqPageSchema(
            faqSchemaItems
          ),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "FAQ", path: "/faq" }
          ])
        ]}
      />

      <section className="space-y-4">
        <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">Common questions, answered</h1>
        <p className="max-w-3xl text-base text-[var(--muted)] sm:text-lg">
          ArticlePod is built around private per-article podcast episodes, with optional weekly digests when you want an easy recap.
        </p>
      </section>

      <section className="mt-8 card p-5">
        <h2 className="text-lg font-semibold">Quick answers</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {faqContent.quickAnswers.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="card block p-4 transition hover:border-[rgba(31,122,90,0.28)] hover:bg-[var(--accent-soft)]/30 focus:outline-none focus:ring-4 focus:ring-[rgba(31,122,90,0.12)]"
            >
              {item.helperText ? (
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">{item.helperText}</p>
              ) : null}
              <p className="mt-2 text-sm font-semibold text-[var(--ink)]">{item.label}</p>
            </a>
          ))}
        </div>
      </section>

      <FaqExplorer sections={faqContent.sections} topicOptions={faqContent.topicOptions} />
    </>
  );
}
