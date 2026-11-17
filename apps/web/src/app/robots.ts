import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/product", "/pricing", "/faq", "/about", "/resources"],
        disallow: ["/app", "/admin", "/api/", "/rss/", "/share"]
      }
    ],
    sitemap: `${appUrl}/sitemap.xml`
  };
}
