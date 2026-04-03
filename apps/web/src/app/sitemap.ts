import type { MetadataRoute } from "next";
import { SEO_MARKETING_LAST_MODIFIED } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return [
    { url: `${appUrl}/`, lastModified: SEO_MARKETING_LAST_MODIFIED, changeFrequency: "weekly", priority: 1 },
    { url: `${appUrl}/product`, lastModified: SEO_MARKETING_LAST_MODIFIED, changeFrequency: "monthly", priority: 0.9 },
    { url: `${appUrl}/pricing`, lastModified: SEO_MARKETING_LAST_MODIFIED, changeFrequency: "weekly", priority: 0.8 },
    { url: `${appUrl}/resources`, lastModified: SEO_MARKETING_LAST_MODIFIED, changeFrequency: "monthly", priority: 0.7 },
    { url: `${appUrl}/faq`, lastModified: SEO_MARKETING_LAST_MODIFIED, changeFrequency: "monthly", priority: 0.7 },
    { url: `${appUrl}/about`, lastModified: SEO_MARKETING_LAST_MODIFIED, changeFrequency: "monthly", priority: 0.6 }
  ];
}
