import { redirect } from "next/navigation";
import { AuthLandingPage } from "@/components/auth-landing-page";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { getAuthUserFromCookies } from "@/lib/auth";
import {
  buildPublicMetadata,
  buildSoftwareApplicationSchema,
  buildWebsiteSchema
} from "@/lib/seo";

const homepageDescription =
  "Turn saved articles, PDFs, and Chrome captures into a private podcast feed and a Karpathy-inspired personal wiki.";

export const metadata = buildPublicMetadata({
  title: "Private podcast feed and personal wiki for saved reading",
  description: homepageDescription,
  path: "/"
});

export default async function HomePage() {
  const user = await getAuthUserFromCookies();
  if (user) {
    redirect("/app");
  }

  return (
    <>
      <SeoJsonLd
        data={[
          buildWebsiteSchema(homepageDescription),
          buildSoftwareApplicationSchema(homepageDescription)
        ]}
      />
      <AuthLandingPage />
    </>
  );
}
