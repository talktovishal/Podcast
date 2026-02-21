import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return [
    { url: `${appUrl}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${appUrl}/product`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${appUrl}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${appUrl}/faq`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${appUrl}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${appUrl}/resources`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 }
  ];
}
