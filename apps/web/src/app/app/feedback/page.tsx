import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FeedbackForm } from "@/components/feedback-form";
import { getAuthUserFromCookies } from "@/lib/auth";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function FeedbackPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/");
  }

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <section className="card p-4 sm:p-5">
          <div>
            <h1 className="font-bold text-2xl">Feedback</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Share ideas, report bugs, and suggest improvements.
            </p>
          </div>
        </section>

        <FeedbackForm />
      </div>
    </main>
  );
}
