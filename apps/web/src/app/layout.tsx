import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ListenLater",
  description: "Private RSS-first personal podcast feed"
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
