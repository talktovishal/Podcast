import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FeedbackForm } from "@/components/feedback-form";
import { LogoutButton } from "@/components/logout-button";
import { getAuthUserFromCookies } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default async function FeedbackPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm text-[var(--muted)]">Product feedback</p>
            <h1 className="font-bold text-2xl">{user.name || user.email}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Share ideas, report bugs, and suggest improvements.</p>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <Link className="rounded-lg bg-[var(--accent)] px-3 py-2 text-center text-sm font-semibold text-white" href="/app">
              Back to episodes
            </Link>
            <Link className="rounded-lg border px-3 py-2 text-center text-sm" href="/app/settings">
              Settings
            </Link>
            {user.role === "ADMIN" ? (
              <Link className="rounded-lg border px-3 py-2 text-center text-sm" href="/admin">
                Admin
              </Link>
            ) : null}
            <LogoutButton />
          </div>
        </header>

        <FeedbackForm />
      </div>
    </main>
  );
}
