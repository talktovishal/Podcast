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

      <section className="card overflow-hidden p-5 sm:p-6 lg:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
          <div className="space-y-4 lg:col-span-2">
            <h1 className="max-w-4xl text-3xl font-bold leading-tight sm:text-4xl">
              Listen to your reading list and finally catch up on what matters
            </h1>
          </div>

          <div className="space-y-4">
            <p className="text-base font-semibold text-[var(--ink)] sm:text-lg">
              Smita Busar, Founder, engineer, and builder
            </p>
            <p className="max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
              Growing up in a family of doctors and professors, I developed an
              early respect for knowledge and lifelong learning. As an engineer,
              and a tinkerer at heart, I have always been drawn to building
              solutions that make life better. That curiosity shaped my path
              from full-stack engineer to AI product thinker.
            </p>
          </div>

          <div className="mx-auto w-full max-w-sm">
            <div className="overflow-hidden rounded-[30px] border border-[rgba(31,122,90,0.16)] bg-[linear-gradient(180deg,rgba(248,252,251,0.98),rgba(228,243,237,0.94))] p-3 shadow-[0_24px_50px_rgba(24,38,32,0.08)]">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-white">
                <Image
                  alt="Portrait of Smita Busar, founder of ArticlePod."
                  className="object-cover object-[56%_18%]"
                  fill
                  priority
                  sizes="(min-width: 1024px) 22rem, (min-width: 640px) 20rem, 100vw"
                  src="/brand/founder-portrait.jpg"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 space-y-5 sm:space-y-6">
        <article className="rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-[linear-gradient(180deg,rgba(248,252,251,0.94),rgba(239,247,244,0.94))] p-5 sm:p-6">
          <div className="max-w-3xl space-y-3">
            <h2 className="text-2xl font-semibold leading-tight">
              Why I build ArticlePod
            </h2>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
              Today, innovation is moving quickly across every field, especially
              in software engineering, where tools and technologies keep
              changing. Like many people, I subscribed to newsletters, saved
              articles for later, and left too many tabs open across too many
              devices. As a mom juggling daily routines and a busy life, I often
              had to stop reading halfway through an article and rarely made it
              back. That gap between wanting to learn and actually keeping up is
              what inspired me.
            </p>
          </div>
        </article>

        <article className="rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-white/92 p-5 shadow-[0_14px_34px_rgba(24,38,32,0.05)] sm:p-6">
          <div className="max-w-3xl space-y-4">
            <h2 className="text-2xl font-semibold leading-tight">
              How it has improved my life
            </h2>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
              I built ArticlePod to solve a problem I knew well. It turns
              article URLs and text-based PDFs into private podcast episodes I
              can listen to in my favorite podcast apps, even offline. Save one
              item, get one episode. For easy recaps, I can also add a weekly
              digest podcast or email summaries.
            </p>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
              Within a few weeks, I was finishing more of the articles and PDFs
              I actually cared about, and my open tabs dropped from more than 50
              to fewer than 10 across all my devices. Cooking, driving, walking,
              and everyday chores became more interesting and productive. I was
              no longer leaving articles half-read.
            </p>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
              Most importantly, I felt more current, more informed, and happier.
              I stayed up to date with the latest technology, felt sharper at
              professional meetups, and found myself talking not just about past
              work, but about how I am using AI to solve everyday problems in my
              own life.
            </p>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
              Honestly, I believe better technology leads to better habits.
              ArticlePod is a live example.
            </p>
          </div>
        </article>

        <article className="rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-[rgba(247,251,250,0.92)] p-5 sm:p-6">
          <div className="max-w-3xl space-y-4">
            <h2 className="text-2xl font-semibold leading-tight">
              Why I care?
            </h2>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
              Above all, I want ArticlePod to feel personal, calm, and genuinely
              useful long after the novelty fades. Private RSS matters because
              the best listening habits fit naturally into the podcast apps you
              already use, without making your reading history feel public. I
              want to keep building this for people who save thoughtful reading,
              want to learn deeply, and value a product that respects both their
              attention and their privacy.
            </p>
            <p className="inline-flex max-w-fit rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-semibold text-[#0f5b42]">
              Make your reading list effortless—listen anywhere, anytime, and
              retain more
            </p>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
              The journey continues. For me, this is not just about fitting
              reading into a busy life. It is also about building a personal
              knowledge base over time, one that can grow into a personal wiki I
              can return to, learn from, and keep expanding. Stay tuned.
            </p>
          </div>
        </article>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
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
        <article className="card p-5">
          <h2 className="text-lg font-semibold">Who ArticlePod is for</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            The product is designed for people who love to read and save
            thoughtful articles, but need a more practical way to keep track of
            them. It enhances reading and learning by making the most valuable
            pieces easier to organize, finish, retain, and revisit.
          </p>
        </article>
      </section>
    </>
  );
}
