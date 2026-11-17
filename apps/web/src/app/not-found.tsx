import Link from "next/link";
import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <div className="fixed inset-x-0 top-0 z-30 shrink-0 border-b border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.94)] backdrop-blur">
        <div className="container-shell py-2 sm:py-4">
          <MarketingHeader />
        </div>
      </div>

      <main className="flex-1">
        <div className="container-shell pb-20 pt-24 sm:pb-24 sm:pt-24">
          <section className="card max-w-3xl border-[rgba(31,122,90,0.14)] bg-[rgba(255,255,255,0.96)] p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              404
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-[2.6rem]">
              Page not found
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">
              That URL does not match a public page in ArticlePod. Check the
              address or head back to a page you know.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white"
              >
                Back to homepage
              </Link>
              <Link
                href="/pricing"
                className="inline-flex rounded-lg border border-[#bfded4] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ink)]"
              >
                See pricing
              </Link>
            </div>
          </section>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 shrink-0 border-t border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.96)] backdrop-blur">
        <div className="container-shell py-2 sm:py-4">
          <MarketingCta />
        </div>
      </div>
    </div>
  );
}
