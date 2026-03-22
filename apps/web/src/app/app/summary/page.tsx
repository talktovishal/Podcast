import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SummaryStudioClient } from "@/components/summary-studio-client";
import { getAuthUserFromCookies } from "@/lib/auth";
import { listSelectableSummaryItems, listSummaryRunsForUser } from "@/lib/summaries";

export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default async function SummaryStudioPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const [items, runs] = await Promise.all([listSelectableSummaryItems(user.id), listSummaryRunsForUser(user.id, 20)]);

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm text-[var(--muted)]">Manual editorial workspace</p>
            <h1 className="font-bold text-2xl">Summary Studio</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-lg border px-3 py-2 text-sm" href="/app">
              Back to library
            </Link>
            <Link className="rounded-lg border px-3 py-2 text-sm" href="/app/settings">
              Digest settings
            </Link>
          </div>
        </header>

        <SummaryStudioClient
          initialItems={items.map((item) => ({
            ...item,
            createdAt: item.createdAt.toISOString()
          }))}
          initialRuns={runs.map((run) => ({
            id: run.id,
            requestedTitle: run.requestedTitle,
            title: run.title,
            status: run.status,
            targetLengthMinutes: run.targetLengthMinutes,
            selectedItemCount: run.selectedItemCount,
            podcastEnabled: run.podcastEnabled,
            podcastStatus: run.podcastStatus,
            podcastError: run.podcastError,
            summaryProvider: run.summaryProvider,
            summaryModel: run.summaryModel,
            summaryDeployment: run.summaryDeployment,
            fallbackUsed: run.fallbackUsed,
            errorCode: run.errorCode,
            errorMessage: run.errorMessage,
            completedAt: run.completedAt ? run.completedAt.toISOString() : null,
            createdAt: run.createdAt.toISOString()
          }))}
        />
      </div>
    </main>
  );
}
