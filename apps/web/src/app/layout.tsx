import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";
import {
  BRAND_APPLE_ICON_PATH,
  BRAND_FAVICON_PATH,
  BRAND_ICON_192_PATH,
  BRAND_ICON_512_PATH,
  BRAND_MANIFEST_PATH,
  BRAND_PODCAST_COVER_PATH
} from "@/lib/brand-assets";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const siteDescription =
  "Turn saved articles and PDFs into a private podcast feed with instant episodes, Chrome capture, and weekly digest summary options.";

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
    "weekly digest",
    "knowledge management",
    "article to audio"
  ],
  authors: [{ name: BRAND_NAME }],
  creator: BRAND_NAME,
  manifest: BRAND_MANIFEST_PATH,
  icons: {
    icon: [
      { url: BRAND_FAVICON_PATH, type: "image/png", sizes: "192x192" },
      { url: BRAND_ICON_192_PATH, sizes: "192x192", type: "image/png" },
      { url: BRAND_ICON_512_PATH, sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: BRAND_APPLE_ICON_PATH, sizes: "180x180", type: "image/png" }],
    shortcut: [BRAND_FAVICON_PATH]
  },
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
    images: [{ url: BRAND_PODCAST_COVER_PATH, alt: `${BRAND_NAME} cover art` }]
  },
  twitter: {
    card: "summary",
    title: BRAND_NAME,
    description: siteDescription,
    images: [BRAND_PODCAST_COVER_PATH]
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
