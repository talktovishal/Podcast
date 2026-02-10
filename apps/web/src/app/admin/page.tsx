import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUserFromCookies } from "@/lib/auth";
import { getAdminMetrics } from "@/lib/dashboard";

export default async function AdminPage() {
  const user = await getAuthUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  if (user.role !== "ADMIN") {
    redirect("/app");
  }

  const metrics = await getAdminMetrics();

  return (
    <main className="py-5 sm:py-8">
      <div className="container-shell space-y-6">
        <header className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm text-[var(--muted)]">Administrator dashboard</p>
            <h1 className="font-bold text-2xl">System observability</h1>
          </div>

          <Link href="/app" className="w-full rounded-lg border px-3 py-2 text-center text-sm sm:w-auto">
            Back to app
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <article className="card p-4">
            <p className="text-xs text-[var(--muted)]">Active users</p>
            <p className="mt-1 text-3xl font-semibold">{metrics.activeUsers}</p>
          </article>
          <article className="card p-4">
            <p className="text-xs text-[var(--muted)]">Total items</p>
            <p className="mt-1 text-3xl font-semibold">{metrics.totalItems}</p>
          </article>
          <article className="card p-4">
            <p className="text-xs text-[var(--muted)]">Ready items</p>
            <p className="mt-1 text-3xl font-semibold">{metrics.readyItems}</p>
          </article>
          <article className="card p-4">
            <p className="text-xs text-[var(--muted)]">Failed items</p>
            <p className="mt-1 text-3xl font-semibold">{metrics.failedItems}</p>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="card p-5">
            <h2 className="mb-3 text-lg font-semibold">Recent job activity</h2>
            <div className="space-y-2">
              {metrics.recentJobs.map((job) => (
                <div key={job.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">
                    {job.item.title || "Untitled"} • {job.status.toLowerCase()}
                  </p>
                  <p className="text-xs text-[var(--muted)]">Attempt {job.attempt} • {new Date(job.createdAt).toLocaleString()}</p>
                  {job.errorMessage ? <p className="mt-1 text-xs text-[var(--danger)]">{job.errorMessage}</p> : null}
                </div>
              ))}
            </div>
          </article>

          <article className="card p-5">
            <h2 className="mb-3 text-lg font-semibold">Recent errors</h2>
            <div className="space-y-2">
              {metrics.recentErrors.length === 0 ? <p className="text-sm text-[var(--muted)]">No recent errors.</p> : null}
              {metrics.recentErrors.map((event) => (
                <div key={event.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">{event.stage}</p>
                  <p className="text-xs text-[var(--muted)]">{new Date(event.createdAt).toLocaleString()}</p>
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-xs text-[var(--danger)]">
                    {JSON.stringify(event.payloadJson, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
