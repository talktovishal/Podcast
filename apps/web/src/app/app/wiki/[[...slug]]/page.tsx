import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WikiBrowserClient } from "@/components/wiki-browser-client";
import { getAuthUserFromCookies } from "@/lib/auth";
import { getUserWikiManifestForApp, getUserWikiPageForApp } from "@/lib/wiki";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function WikiPage({
  params,
}: {
  params: { slug?: string[] };
}) {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  const manifest = await getUserWikiManifestForApp(user.id);
  if (!manifest) {
    return (
      <main className="py-5 sm:py-8">
        <div className="container-shell">
          <section className="card p-5 sm:p-6">
            <h1 className="font-bold text-2xl">Wiki</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              No personal wiki has been published for this account yet. Run the local
              wiki prepare and publish flow first, then refresh this page.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const page = await getUserWikiPageForApp(user.id, { slug: params.slug });
  if (!page) {
    notFound();
  }

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <section className="card p-4 sm:p-5">
          <div>
            <h1 className="font-bold text-2xl">Wiki</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Browse the current Karpathy-style LLM wiki built from your saved items
              and snippets.
            </p>
          </div>
        </section>

        <WikiBrowserClient
          activePage={page.page}
          content={page.content}
          manifest={manifest}
        />
      </div>
    </main>
  );
}
