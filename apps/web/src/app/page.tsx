import { redirect } from "next/navigation";
import { MarketingHomePage } from "@/components/marketing-home-page";
import { getAuthUserFromCookies } from "@/lib/auth";
import { buildPublicMetadata } from "@/lib/seo";

export const metadata = buildPublicMetadata({
  title: "Private podcast feed for articles and PDFs",
  description:
    "Turn saved articles, PDFs, and Chrome captures into a private podcast feed. Listen in Apple Podcasts, YouTube Music, or any RSS-compatible app.",
  path: "/"
});

export default async function HomePage() {
  const user = await getAuthUserFromCookies();
  if (user) {
    redirect("/app");
  }

  return <MarketingHomePage />;
}
