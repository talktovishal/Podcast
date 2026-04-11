import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUserFromCookies } from "@/lib/auth";
import { getUserWikiManifestForApp } from "@/lib/wiki";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SummaryStudioPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  const wikiManifest = await getUserWikiManifestForApp(user.id);
  redirect(wikiManifest ? "/app/wiki" : "/app");
}
