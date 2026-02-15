import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND_NAME } from "@articlepod/core/src/config/brand";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: "Private RSS-first personal podcast feed"
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
