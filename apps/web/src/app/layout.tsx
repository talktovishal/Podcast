import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const siteDescription =
  "Turn saved articles and PDFs into a private podcast feed. Get instant episodes, daily and weekly briefings, and companion email summaries.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: BRAND_NAME,
    template: `%s | ${BRAND_NAME}`
  },
  description: siteDescription,
  keywords: [
    "podcast",
    "article podcast",
    "personal podcast feed",
    "RSS feed",
    "text to speech",
    "daily briefing",
    "knowledge management",
    "article to audio"
  ],
  authors: [{ name: BRAND_NAME }],
  creator: BRAND_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true }
  },
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: BRAND_NAME,
    description: siteDescription,
    url: appUrl,
    images: [{ url: "/brand/articlepod-mark.svg", alt: `${BRAND_NAME} logo` }]
  },
  twitter: {
    card: "summary",
    title: BRAND_NAME,
    description: siteDescription,
    images: ["/brand/articlepod-mark.svg"]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
