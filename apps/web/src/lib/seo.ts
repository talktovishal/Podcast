import type { Metadata } from "next";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";
import {
  BRAND_ICON_512_PATH,
  BRAND_PODCAST_COVER_PATH,
  absoluteBrandAssetUrl,
} from "@/lib/brand-assets";
import { paidPlanConfig } from "@/lib/paid-plan-config";

export const SEO_SITE_URL = process.env.APP_URL ?? "http://localhost:3000";
export const SEO_MARKETING_LAST_MODIFIED = new Date("2026-04-05T00:00:00.000Z");

const DEFAULT_KEYWORDS = [
  "article to podcast",
  "article to audio",
  "private podcast feed",
  "listen to articles",
  "listen to PDFs",
  "private RSS feed",
  "text to speech articles",
  "Chrome article capture",
];

const DEFAULT_IMAGE_URL = absoluteBrandAssetUrl(
  SEO_SITE_URL,
  BRAND_PODCAST_COVER_PATH,
);
const DEFAULT_LOGO_URL = absoluteBrandAssetUrl(
  SEO_SITE_URL,
  BRAND_ICON_512_PATH,
);

type PublicMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
};

type BreadcrumbItem = {
  name: string;
  path: string;
};

type FaqItem = {
  question: string;
  answer: string;
};

type HowToStep = {
  name: string;
  text: string;
};

function normalizePath(path: string): string {
  if (path === "/") {
    return path;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

export function absoluteSeoUrl(path: string): string {
  return new URL(normalizePath(path), SEO_SITE_URL).toString();
}

export function buildPublicMetadata({
  title,
  description,
  path,
  keywords = DEFAULT_KEYWORDS,
  noIndex = false,
}: PublicMetadataOptions): Metadata {
  const canonicalPath = normalizePath(path);
  const resolvedTitle =
    title === BRAND_NAME ? BRAND_NAME : `${title} | ${BRAND_NAME}`;

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: canonicalPath,
    },
    robots: noIndex
      ? {
          index: false,
          follow: true,
          googleBot: {
            index: false,
            follow: true,
          },
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
          },
        },
    openGraph: {
      type: "website",
      siteName: BRAND_NAME,
      title: resolvedTitle,
      description,
      url: absoluteSeoUrl(canonicalPath),
      images: [
        {
          url: DEFAULT_IMAGE_URL,
          alt: `${BRAND_NAME} cover art`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description,
      images: [DEFAULT_IMAGE_URL],
    },
  };
}

export function buildOrganizationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND_NAME,
    url: absoluteSeoUrl("/"),
    logo: DEFAULT_LOGO_URL,
  };
}

export function buildWebsiteSchema(
  description: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BRAND_NAME,
    url: absoluteSeoUrl("/"),
    description,
    inLanguage: "en-US",
  };
}

export function buildSoftwareApplicationSchema(
  description: string,
): Record<string, unknown> {
  const monthlyPlan = paidPlanConfig("PRO_MONTHLY");
  const annualPlan = paidPlanConfig("PRO_ANNUAL");

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND_NAME,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    description,
    url: absoluteSeoUrl("/"),
    image: DEFAULT_IMAGE_URL,
    featureList: [
      "Turn articles and text-based PDFs into private podcast episodes",
      "Deliver episodes through a private RSS feed that works in standard podcast apps",
      "Capture pages from Chrome with a one-time connect flow",
      "Create weekly digest podcast and email recap options",
    ],
    offers: [
      {
        "@type": "Offer",
        name: "Starter",
        price: "0",
        priceCurrency: "USD",
        url: absoluteSeoUrl("/pricing"),
        description:
          "Start free with a private podcast feed for saved reading.",
      },
      {
        "@type": "Offer",
        name: "Pro Monthly",
        price: "15",
        priceCurrency: "USD",
        url: absoluteSeoUrl("/pricing"),
        description: `Upgrade monthly for ${monthlyPlan.dailyPodcastLimit} new private podcast episodes per 24 hours, ${monthlyPlan.dailySummaryLimit} summary-mode items per 24 hours, ${monthlyPlan.weeklySummaryLimit} manual summaries every 7 days, and digest workflows.`,
      },
      {
        "@type": "Offer",
        name: "Pro Annual",
        price: "130",
        priceCurrency: "USD",
        url: absoluteSeoUrl("/pricing"),
        description: `Upgrade annually and save nearly 30 percent while getting ${annualPlan.dailyPodcastLimit} new private podcast episodes per 24 hours, ${annualPlan.dailySummaryLimit} summary-mode items per 24 hours, and ${annualPlan.weeklySummaryLimit} manual summaries every 7 days.`,
      },
    ],
  };
}

export function buildBreadcrumbSchema(
  items: ReadonlyArray<BreadcrumbItem>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteSeoUrl(item.path),
    })),
  };
}

export function buildFaqPageSchema(
  items: ReadonlyArray<FaqItem>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildHowToSchema({
  name,
  description,
  path,
  steps,
}: {
  name: string;
  description: string;
  path: string;
  steps: ReadonlyArray<HowToStep>;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    url: absoluteSeoUrl(path),
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}
