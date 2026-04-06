import type { Metadata } from "next";
import { SeoJsonLd } from "@/components/seo-json-ld";
import {
  buildBreadcrumbSchema,
  buildFaqPageSchema,
  buildPublicMetadata
} from "@/lib/seo";

type FaqItem = {
  q: string;
  a: string;
};

type FaqSectionId =
  | "getting-started"
  | "inputs-capture"
  | "privacy-feed"
  | "podcast-apps"
  | "account-access";

type FaqSection = {
  id: FaqSectionId;
  title: string;
  items: ReadonlyArray<FaqItem>;
};

type QuickAnswer = {
  label: string;
  helperText?: string;
  href: `#${FaqSectionId}`;
};

const faqDescription =
  "Answers to common questions about ArticlePod, including private podcast episodes, weekly digest options, Chrome capture, PDFs, and podcast app support.";

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

const faqSections: ReadonlyArray<FaqSection> = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        q: "What happens when I save an article?",
        a: "Each saved article, PDF, or browser capture is processed into its own podcast episode. When processing finishes, it appears in your private feed like a normal episode you can play in a standard podcast app."
      },
      {
        q: "Do I need the Chrome extension?",
        a: "No. You can paste a URL or upload a PDF in the web app. The extension is simply the fastest way to capture a page you already have open in Chrome."
      },
      {
        q: "Do I get digest summaries too?",
        a: "The core experience is one episode per saved item. You can also turn on digest-style recaps from Settings, with weekly podcast and email options when you want a higher-level summary of what you saved."
      }
    ]
  },
  {
    id: "inputs-capture",
    title: "Inputs & capture",
    items: [
      {
        q: "What content can I convert?",
        a: "You can submit article URLs, upload text-based PDFs, and capture open pages with the Chrome extension. ArticlePod focuses on clean, readable sources and keeps the original links attached for traceability. If content is too noisy or unsupported, you’ll see a clear error instead of silent failure."
      },
      {
        q: "Can I upload scanned PDFs?",
        a: "Not yet. ArticlePod supports text-based PDFs. If a PDF is mostly scanned images, it fails with a clear message instead of guessing with OCR."
      },
      {
        q: "Why can processing take longer for large inputs?",
        a: "Long sources are synthesized in chunks to keep jobs resilient and recoverable. Chunking improves reliability for long-form content and reduces the chance of total job failure. It can take a bit longer, but it preserves stability and restart safety."
      }
    ]
  },
  {
    id: "privacy-feed",
    title: "Privacy & feed",
    items: [
      {
        q: "Is my feed private?",
        a: "Yes. Each account gets a private feed URL tied to a secret token. Treat that link like a password: if you ever need to replace it, you can rotate it and re-add the new URL in your podcast app."
      },
      {
        q: "How long do you keep generated podcast audio?",
        a: "Generated MP3 episodes stay available for 60 days after publication. After that, ArticlePod automatically removes the audio from active feeds and playback links so storage stays manageable for regular use."
      }
    ]
  },
  {
    id: "podcast-apps",
    title: "Podcast apps",
    items: [
      {
        q: "Which podcast apps are supported?",
        a: "Apple Podcasts, YouTube Music, and other RSS-capable podcast apps work. ArticlePod serves feeds and MP3 audio with the compatibility behaviors podcast apps expect, including seeking and resume support."
      },
      {
        q: "Do I also get a reading version?",
        a: "Yes, when you use digest summaries. Weekly digests can include reading-friendly email summaries, and saved items keep their source links so you can always jump back to the original article."
      }
    ]
  },
  {
    id: "account-access",
    title: "Account & access",
    items: [
      {
        q: "Can I use OAuth and email login together?",
        a: "Yes. Email login works by default, and Google, Facebook, and Apple sign-in can be enabled when configured. Those options are designed to coexist with the same account."
      }
    ]
  }
];

const quickAnswers: ReadonlyArray<QuickAnswer> = [
  {
    label: "One save becomes one episode",
    helperText: "Getting started",
    href: "#getting-started"
  },
  {
    label: "URLs, PDFs, and Chrome capture",
    helperText: "Inputs & capture",
    href: "#inputs-capture"
  },
  {
    label: "Private feed URL you control",
    helperText: "Privacy & feed",
    href: "#privacy-feed"
  },
  {
    label: "Works in standard podcast apps",
    helperText: "Podcast apps",
    href: "#podcast-apps"
  }
];

const faqSchemaItems = faqSections.flatMap((section) => section.items);

export default function FaqPage() {
  return (
    <>
      <SeoJsonLd
        data={[
          buildFaqPageSchema(
            faqSchemaItems.map((item) => ({
              question: item.q,
              answer: item.a
            }))
          ),
          buildBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "FAQ", path: "/faq" }
          ])
        ]}
      />

      <section className="space-y-4">
        <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">Answers to common questions</h1>
        <p className="max-w-3xl text-base text-[var(--muted)] sm:text-lg">
          ArticlePod is centered on private per-article podcast episodes first, with weekly digest options available when you want a
          recap layer.
        </p>
      </section>

      <section className="mt-8 card p-5">
        <h2 className="text-lg font-semibold">Quick answers</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickAnswers.map((item) => (
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

      <div className="mt-8 space-y-8">
        {faqSections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24 space-y-3" aria-labelledby={`faq-${section.id}`}>
            <h2 id={`faq-${section.id}`} className="text-xl font-semibold sm:text-2xl">
              {section.title}
            </h2>
            <div className="space-y-3">
              {section.items.map((item) => (
                <details key={item.q} className="card p-4">
                  <summary className="cursor-pointer text-sm font-semibold sm:text-base">{item.q}</summary>
                  <p className="mt-2 text-sm text-[var(--muted)]">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
