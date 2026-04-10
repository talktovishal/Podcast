import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChromeExtensionGuidePanels } from "@/components/chrome-extension-guide-panels";
import { ChromeExtensionSetupCard } from "@/components/chrome-extension-setup-card";
import { getAuthUserFromCookies } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ChromeExtensionPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <section className="card p-4 sm:p-5">
          <div className="space-y-1">
            <h1 className="font-bold text-2xl">Chrome Extension</h1>
            <p className="text-sm text-[var(--muted)]">
              Install it from the Chrome Web Store, copy the ready connect
              code, and pair the extension once.
            </p>
          </div>
        </section>

        <ChromeExtensionSetupCard id="chrome-extension" isAuthenticated />
        <ChromeExtensionGuidePanels />
      </div>
    </main>
  );
}
