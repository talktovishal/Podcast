import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShellNav } from "@/components/app-shell-nav";
import { SnippetsWorkspaceClient } from "@/components/snippets-workspace-client";
import { getAuthUserFromCookies } from "@/lib/auth";
import { listSnippetsForUser } from "@/lib/snippets";

export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default async function SnippetsPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  const snippets = await listSnippetsForUser(user.id, 100);

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm text-[var(--muted)]">Selection workspace</p>
              <AppShellNav current="snippets" />
            </div>
            <div className="space-y-1">
              <h1 className="font-bold text-2xl">Snippets</h1>
              <p className="text-sm text-[var(--muted)]">
                Save highlights from the Chrome extension now, then review and annotate them before you decide what deserves a
                deeper summary later.
              </p>
            </div>
          </div>
        </header>

        <SnippetsWorkspaceClient
          initialSnippets={snippets.map((snippet) => ({
            id: snippet.id,
            sourceUrl: snippet.sourceUrl,
            sourceTitle: snippet.sourceTitle,
            selectedText: snippet.selectedText,
            comment: snippet.comment,
            createdAt: snippet.createdAt.toISOString(),
            updatedAt: snippet.updatedAt.toISOString()
          }))}
        />
      </div>
    </main>
  );
}
