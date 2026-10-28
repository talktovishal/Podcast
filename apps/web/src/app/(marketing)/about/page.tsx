import Image from "next/image";
import type { Metadata } from "next";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { KARPATHY_LLM_WIKI_GIST_URL } from "@/lib/marketing-content";
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

      <section id="vishal-story" aria-labelledby="vishal-name" className="space-y-6">
        <div className="card overflow-hidden border-[rgba(31,122,90,0.14)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(239,247,244,0.9))] p-5 sm:p-6 lg:p-8">
          <h1 className="max-w-4xl text-3xl font-bold leading-tight sm:text-4xl lg:max-w-none">
            Listen to your reading list and finally catch up on what matters
          </h1>

          <div className="mt-6 flex flex-col lg:flow-root">
            <div className="mx-auto mb-5 w-full max-w-[18rem] lg:float-right lg:mb-4 lg:ml-8 lg:mr-0">
              <div className="relative aspect-square overflow-hidden rounded-[30px] border border-[rgba(31,122,90,0.14)] bg-white shadow-[0_24px_45px_rgba(24,38,32,0.08)]">
                <Image
                  alt="Portrait of Vishal Chowdhary, co-founder of ArticlePod."
                  className="object-cover"
                  fill
                  priority
                  sizes="18rem"
                  src="/brand/vishal-chowdhary.jpg"
                />
              </div>
            </div>

            <header className="order-first mb-5 space-y-1">
              <h2 id="vishal-name" className="text-2xl font-semibold leading-tight">
                Vishal Chowdhary
              </h2>
              <p className="text-base font-semibold text-[var(--muted)]">
                Co-founder
              </p>
            </header>

            <div className="space-y-5">
              <h3 className="text-xl font-semibold leading-tight sm:text-2xl">
                Why I built ArticlePod
              </h3>
              <figure className="space-y-2 border-l-2 border-[var(--accent)] pl-4">
                <blockquote
                  cite="https://quoteinvestigator.com/2012/04/28/shorter-letter/"
                  className="text-base leading-7 text-[var(--ink)] sm:text-lg"
                >
                  <p>
                    &quot;I have made this letter longer than usual, only
                    because I had not the time to make it shorter.&quot;
                  </p>
                </blockquote>
                <figcaption className="text-sm text-[var(--muted)]">
                  Blaise Pascal
                </figcaption>
              </figure>
              <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
                I have always appreciated the power of the written word. When I
                write an email to an executive, much of the effort goes into
                making it shorter, clearer, and more useful. That is what I
                value in good writing: someone has taken the time to think,
                edit, and get to the point.
              </p>
              <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
                I wanted that same quality in what I listened to. Often, I
                wanted the substance of an article I had chosen, rather than a
                long conversation around it. But the articles I read across the
                web did not come with their own podcast feed.
              </p>
            </div>
          </div>
        </div>

        <article className="rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-white/92 p-5 shadow-[0_14px_34px_rgba(24,38,32,0.05)] sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] lg:gap-10">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold leading-tight">
                My reading list, in my podcast app
              </h3>
              <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
                My interests take me across many subjects and websites. I
                wanted to choose what mattered to me, save it, and listen when I
                had the time.
              </p>
            </div>

            <div className="space-y-4">
              <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
                Keeping things simple matters to me. The Chrome extension makes
                saving articles easy. Each saved article becomes a private
                podcast episode, delivered through a private RSS feed to the
                podcast app I already use. There is no need to install another
                app just to listen.
              </p>
              <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
                That is how I use ArticlePod myself. I build up a backlog of
                articles I want to read and listen while traveling. It has
                become a practical way to catch up on the things I genuinely
                want to learn.
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-[rgba(247,251,250,0.92)] p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] lg:gap-10">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold leading-tight">
                Beyond listening: a personal wiki
              </h3>
              <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
                Listening solved one problem, but I still wanted a better way
                to keep track of what I was learning. Bookmarks did not scale
                across all the articles and ideas I wanted to keep.
              </p>
            </div>

            <div className="space-y-4">
              <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
                Inspired by{" "}
                <a
                  className="font-semibold text-[var(--ink)] underline decoration-[#8cb7ab] underline-offset-4 transition hover:decoration-[var(--ink)]"
                  href={KARPATHY_LLM_WIKI_GIST_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  Andrej Karpathy&apos;s LLM Wiki idea
                </a>
                , ArticlePod&apos;s personal wiki brings the links, snippets,
                and ideas worth retaining into one place, so learning does not
                have to end when an episode does.
              </p>
              <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
                For me, this is not about collecting knowledge on one subject.
                It is about building a personal knowledge base around the
                things I choose to explore, and having somewhere to return to
                them.
              </p>
            </div>
          </div>
        </article>
      </section>

      <section
        id="smita-story"
        aria-labelledby="smita-name"
        className="mt-8 rounded-[24px] border border-[rgba(31,122,90,0.12)] bg-white/92 p-5 shadow-[0_14px_34px_rgba(24,38,32,0.05)] sm:p-6 lg:p-8"
      >
        <div className="flex flex-col lg:flow-root">
          <div className="mx-auto mb-5 w-full max-w-[18rem] lg:float-right lg:mb-4 lg:ml-8 lg:mr-0">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[30px] border border-[rgba(31,122,90,0.14)] bg-white shadow-[0_24px_45px_rgba(24,38,32,0.08)]">
              <Image
                alt="Portrait of Smita Busar, co-founder of ArticlePod."
                className="object-cover object-[56%_18%]"
                fill
                sizes="18rem"
                src="/brand/founder-portrait.jpg"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[rgba(24,38,32,0.12)] to-transparent" />
            </div>
          </div>

          <header className="order-first mb-5 space-y-1">
            <h2 id="smita-name" className="text-2xl font-semibold leading-tight">
              Smita Busar
            </h2>
            <p className="text-base font-semibold text-[var(--muted)]">
              Co-founder
            </p>
          </header>

          <div className="space-y-5">
            <h3 className="text-xl font-semibold leading-tight sm:text-2xl">
              Making room for learning
            </h3>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
              Growing up in a family of doctors and professors, I developed an
              early respect for knowledge and lifelong learning. As an engineer
              and a tinkerer, I have always been drawn to things that make
              everyday life better.
            </p>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
              Like many people, I subscribed to newsletters, saved articles for
              later, and left too many tabs open across too many devices. As a
              mom juggling daily routines and a busy life, I often stopped
              reading halfway through an article and rarely made it back.
            </p>
            <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
              As one of ArticlePod&apos;s first users, I brought that experience
              into my conversations with Vishal. My feedback helped shape a
              simpler product that fits more naturally into everyday life.
            </p>

            <div className="space-y-4 border-t border-[rgba(31,122,90,0.14)] pt-5">
              <h3 className="text-xl font-semibold leading-tight sm:text-2xl">
                How it has improved my life
              </h3>
              <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
                Within a few weeks, I was finishing more of the articles and
                PDFs I actually cared about, and my open tabs dropped from more
                than 50 to fewer than 10 across my devices. Cooking, driving,
                walking, and everyday chores became opportunities to catch up.
              </p>
              <p className="text-sm leading-6 text-[var(--muted)] sm:text-base">
                I felt more current, more informed, and happier. I want
                ArticlePod to keep feeling personal, calm, and genuinely useful,
                while respecting people&apos;s attention and privacy.
              </p>
            </div>
          </div>
        </div>
      </section>

      <p className="mt-8 inline-flex max-w-fit rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-semibold text-[#0f5b42]">
        Make your reading list effortless. Listen anywhere, anytime, and retain
        more.
      </p>

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
              <span>Personal wiki</span>
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
