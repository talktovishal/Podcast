import Image from "next/image";
import type { Metadata } from "next";
import { SeoJsonLd } from "@/components/seo-json-ld";
import {
  buildBreadcrumbSchema,
  buildOrganizationSchema,
  buildPublicMetadata,
} from "@/lib/seo";

const aboutDescription =
  "Learn how ArticlePod turns article URLs and text-based PDFs into private podcast episodes you can hear in your favorite podcast apps, even offline.";

export const metadata: Metadata = buildPublicMetadata({
  title: "About ArticlePod",
  description: aboutDescription,
  path: "/about",
  keywords: [
    "about articlepod",
    "private podcast feed company",
    "article to audio mission",
  ],
});

const founderLifeImprovements = [
  "I finish more of the articles and PDFs I actually care about instead of letting them pile up unread.",
  "I retain more because I can revisit strong ideas while walking, driving, or doing everyday routines.",
  "My backlog feels lighter and more intentional, not like a growing list of things I should have already read.",
] as const;

export default function AboutPage() {
  return (
    <>
      <SeoJsonLd
        data={[
          buildOrganizationSchema(),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "About", path: "/about" },
          ]),
        ]}
      />

      <section className="space-y-4">
        <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">
          Listen to your reading list and finally catch up on what matters
        </h1>
        <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
          ArticlePod turns article URLs and text-based PDFs into private podcast
          episodes you can hear in your favorite podcast apps, even offline.
          Save one item, get one episode. For easy recaps, add a weekly digest
          podcast or email summaries.
        </p>
      </section>

      <section className="mt-8 space-y-5 sm:space-y-6">
        <article className="card overflow-hidden p-5 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                  From the co-founder
                </p>
                <h2 className="max-w-2xl text-2xl font-semibold leading-tight sm:text-3xl">
                  Founder intro
                </h2>
                <p className="text-sm font-semibold text-[var(--ink)] sm:text-base">
                  Smita Busar, Co-founder
                </p>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                I built ArticlePod for the same reason I kept saving articles in
                the first place: I genuinely wanted to learn from them, but I
                rarely had the uninterrupted reading time to finish them. I
                wanted a calmer way to keep up with the ideas I cared about, in
                the same podcast apps that were already part of my daily
                routine.
              </p>
            </div>

            <div className="mx-auto w-full max-w-sm">
              <div className="overflow-hidden rounded-[28px] border border-[rgba(31,122,90,0.16)] bg-[linear-gradient(180deg,rgba(248,252,251,0.98),rgba(228,243,237,0.94))] p-3 shadow-[0_20px_45px_rgba(24,38,32,0.08)]">
                <div className="overflow-hidden rounded-[22px] border border-[rgba(31,122,90,0.12)] bg-white">
                  <Image
                    alt="ArticlePod co-founder portrait placeholder."
                    className="h-auto w-full"
                    height={960}
                    priority={false}
                    src="/brand/founder-portrait-placeholder.svg"
                    width={800}
                  />
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-[linear-gradient(180deg,rgba(248,252,251,0.94),rgba(239,247,244,0.94))] p-5 sm:p-6">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
              Section 1
            </p>
            <h2 className="text-2xl font-semibold leading-tight">
              Why I built ArticlePod
            </h2>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
              I kept saving thoughtful articles and text-based PDFs, but the
              backlog always grew faster than the time I had to sit down and
              read. Listening was already the easiest way for me to keep up with
              podcasts, so I wanted the same convenience for saved reading
              without turning it into a public feed or a brand-new habit to
              maintain. ArticlePod came out of that tension: wanting deeper
              learning, but needing it to fit real life.
            </p>
          </div>
        </article>

        <article className="rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-white/92 p-5 shadow-[0_14px_34px_rgba(24,38,32,0.05)] sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                Section 2
              </p>
              <h2 className="text-2xl font-semibold leading-tight">
                How it has improved my life
              </h2>
              <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
                The biggest change is that saved reading now has a realistic
                path back into my week. Instead of collecting ideas I mean to
                revisit someday, I can actually bring them with me and finish
                them in pockets of time that used to go unused.
              </p>
            </div>

            <ul className="space-y-3 text-sm leading-6 text-[var(--muted)] sm:text-base">
              {founderLifeImprovements.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-[rgba(247,251,250,0.92)] p-5 sm:p-6">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
              Section 3
            </p>
            <h2 className="text-2xl font-semibold leading-tight">
              Thoughts as co-founder
            </h2>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
              The part I care most about preserving is that ArticlePod should
              feel personal, calm, and useful long after the novelty wears off.
              Private RSS matters because the listening habit works best when it
              fits into your existing podcast routine without making your
              reading history feel public. I want this to stay built for people
              who save thoughtful things, want to learn deeply, and need the
              product to respect both their attention and their privacy.
            </p>
          </div>
        </article>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <article className="card p-5">
          <h2 className="text-lg font-semibold">Mission</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Make your reading list effortless—listen anywhere, anytime, and
            retain more
          </p>
        </article>
        <article className="card p-5">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(31,122,90,0.12)] text-[var(--accent)]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
                <path
                  d="M8 1.75l1.35 3.2 3.4 1.05-3.4 1.05L8 10.25l-1.35-3.2-3.4-1.05 3.4-1.05L8 1.75Zm4.25 7.5.75 1.8 1.75.55-1.75.55-.75 1.8-.75-1.8-1.75-.55 1.75-.55.75-1.8Z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <h2 className="text-lg font-semibold">Live today</h2>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
              />
              <span>Per-article narrated episodes</span>
            </li>
            <li className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
              />
              <span>Chrome extension capture</span>
            </li>
            <li className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
              />
              <span>Private RSS feed delivery</span>
            </li>
            <li className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
              />
              <span>Weekly digest podcast</span>
            </li>
            <li className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
              />
              <span>Weekly Email Options</span>
            </li>
          </ul>
        </article>
        <article className="card p-5">
          <h2 className="text-lg font-semibold">Why private RSS feed</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
              />
              <span>Integrates with your favorite podcast apps</span>
            </li>
            <li className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
              />
              <span>Listening queue Private by default</span>
            </li>
            <li className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
              />
              <span>Easy feed URL rotation</span>
            </li>
          </ul>
        </article>
      </section>

      <section className="mt-8 card p-5">
        <h2 className="text-lg font-semibold">Who ArticlePod is for</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          The product is designed for people who love to read and save
          thoughtful articles, but need a more practical way to keep track of
          them. It enhances reading and learning by making the most valuable
          pieces easier to organize, finish, retain, and revisit.
        </p>
      </section>
    </>
  );
}
