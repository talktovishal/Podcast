import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SnippetsWorkspaceClient } from "@/components/snippets-workspace-client";
import { getAuthUserFromCookies } from "@/lib/auth";
import { listSnippetsForUser } from "@/lib/snippets";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SnippetsPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  const snippets = await listSnippetsForUser(user.id, 100);
  if (snippets.length === 0) {
    redirect("/app");
  }

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <section className="card p-4 sm:p-5">
          <div className="space-y-1">
            <h1 className="font-bold text-2xl">Snippets</h1>
            <p className="text-sm text-[var(--muted)]">
              Save highlights from the Chrome extension now, then review and
              annotate them before you decide what deserves a deeper summary
              later.
            </p>
          </div>
        </section>

        <SnippetsWorkspaceClient
          initialSnippets={snippets.map((snippet) => ({
            id: snippet.id,
            sourceUrl: snippet.sourceUrl,
            sourceTitle: snippet.sourceTitle,
            selectedText: snippet.selectedText,
            selectedHtml: snippet.selectedHtml,
            selectionMarkdown: snippet.selectionMarkdown,
            contextMarkdown: snippet.contextMarkdown,
            captureMarkdown: snippet.captureMarkdown,
            pageMetadata: snippet.pageMetadata,
            comment: snippet.comment,
            createdAt: snippet.createdAt.toISOString(),
            updatedAt: snippet.updatedAt.toISOString(),
          }))}
        />
      </div>
    </main>
  );
}
