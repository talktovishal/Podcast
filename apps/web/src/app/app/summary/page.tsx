import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUserFromCookies } from "@/lib/auth";
import { getBillingSettingsState } from "@/lib/billing";
import { hasAnnualPersonalWikiAccess } from "@/lib/billing-contract";
import { getUserWikiManifestForApp } from "@/lib/wiki";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SummaryStudioPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  const [billingState, wikiManifest] = await Promise.all([
    getBillingSettingsState(user.id),
    getUserWikiManifestForApp(user.id),
  ]);
  redirect(
    wikiManifest || hasAnnualPersonalWikiAccess(billingState.selectedBilling)
      ? "/app/wiki"
      : "/app",
  );
}
