import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShellNav } from "@/components/app-shell-nav";
import { FeedbackForm } from "@/components/feedback-form";
import { getAuthUserFromCookies } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default async function FeedbackPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-sm text-[var(--muted)]">Product feedback</p>
              <AppShellNav current="feedback" />
            </div>
            <div>
              <h1 className="font-bold text-2xl">{user.name || user.email}</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Share ideas, report bugs, and suggest improvements.</p>
            </div>
          </div>
        </header>

        <FeedbackForm />
      </div>
    </main>
  );
}
