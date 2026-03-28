import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShellNav } from "@/components/app-shell-nav";
import { SummaryStudioClient } from "@/components/summary-studio-client";
import { getAuthUserFromCookies } from "@/lib/auth";
import {
  listSelectableSummaryItems,
  listSummaryRunsForUser,
} from "@/lib/summaries";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SummaryStudioPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const [items, runs] = await Promise.all([
    listSelectableSummaryItems(user.id),
    listSummaryRunsForUser(user.id, 20),
  ]);

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm text-[var(--muted)]">
                Manual editorial workspace
              </p>
              <AppShellNav current="summary" />
            </div>
            <div>
              <h1 className="font-bold text-2xl">Summaries</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Build curated markdown roundups from ready items and optionally
                turn them into audio when you need it.
              </p>
            </div>
          </div>
        </header>

        <SummaryStudioClient
          initialItems={items.map((item) => ({
            ...item,
            createdAt: item.createdAt.toISOString(),
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
            createdAt: run.createdAt.toISOString(),
          }))}
        />
      </div>
    </main>
  );
}
