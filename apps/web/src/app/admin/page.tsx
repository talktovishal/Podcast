import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminAnalyticsDashboard } from "@/components/admin-analytics-dashboard";
import { AdminFeedbackInbox } from "@/components/admin-feedback-inbox";
import { AdminQuotaManager } from "@/components/admin-quota-manager";
import { getAuthUserFromCookies } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default async function AdminPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  if (user.role !== "ADMIN") {
    redirect("/app");
  }

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm text-[var(--muted)]">Administrator dashboard</p>
            <h1 className="font-bold text-2xl">Admin analytics</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Investor narrative + reliability signals in one dashboard.</p>
          </div>

          <Link href="/app" className="w-full rounded-lg border px-3 py-2 text-center text-sm sm:w-auto">
            Back to app
          </Link>
        </header>

        <AdminAnalyticsDashboard />
        <AdminQuotaManager />
        <AdminFeedbackInbox />
      </div>
    </main>
  );
}
