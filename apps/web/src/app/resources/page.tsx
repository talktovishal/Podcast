import { MarketingCta } from "@/components/marketing-cta";
import { MarketingHeader } from "@/components/marketing-header";

export default function ResourcesPage() {
  return (
    <main className="min-h-screen py-6 sm:py-10">
      <div className="container-shell">
        <MarketingHeader activeHref="/resources" />
        <section className="space-y-4">
          <p className="inline-block rounded-full border border-[#c9e4dc] bg-[#edf8f5] px-4 py-1 text-xs font-semibold text-[#0f6a54] sm:text-sm">
            Resources
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">Practical starter library</h1>
          <p className="max-w-2xl text-base text-[var(--muted)] sm:text-lg">
            Everything needed to run, connect, and troubleshoot your setup.
          </p>
        </section>

        <nav className="mt-6 flex flex-wrap gap-2 text-sm">
          <a className="rounded-full border px-3 py-1.5 hover:bg-[#e8f5f0]" href="#run-local">
            Run locally
          </a>
          <a className="rounded-full border px-3 py-1.5 hover:bg-[#e8f5f0]" href="#cost-model">
            Cost model
          </a>
          <a className="rounded-full border px-3 py-1.5 hover:bg-[#e8f5f0]" href="#extension">
            Chrome extension
          </a>
          <a className="rounded-full border px-3 py-1.5 hover:bg-[#e8f5f0]" href="#oauth">
            OAuth setup
          </a>
          <a className="rounded-full border px-3 py-1.5 hover:bg-[#e8f5f0]" href="#troubleshooting">
            Troubleshooting
          </a>
        </nav>

        <section id="run-local" className="mt-8 card p-5">
          <h2 className="text-lg font-semibold">Run locally</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Use one command to start web, worker, and python-tts.</p>
          <pre className="mt-3 rounded-lg bg-[#f3f7f5] p-3 text-xs">./run.sh --profile simple</pre>
          <p className="mt-2 text-sm text-[var(--muted)]">Primary guide: `README.md` and `docs/documentation.md`.</p>
        </section>

        <section id="cost-model" className="mt-4 card p-5">
          <h2 className="text-lg font-semibold">Cost model</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Use the Azure cost model workbook to tune assumptions by users, articles/day, average length, retries, and VM count.
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Reference file: `docs/azure-cost-model.md` and workbook output under `exports/costs/`.
          </p>
        </section>

        <section id="extension" className="mt-4 card p-5">
          <h2 className="text-lg font-semibold">Chrome extension</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Package and load extension for one-click page capture.</p>
          <pre className="mt-3 rounded-lg bg-[#f3f7f5] p-3 text-xs">npm run extension:package</pre>
          <p className="mt-2 text-sm text-[var(--muted)]">Guide: `apps/extension/README.md`.</p>
        </section>

        <section id="oauth" className="mt-4 card p-5">
          <h2 className="text-lg font-semibold">OAuth setup</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Enable Google and Apple login via provider consoles and env vars.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">Guide: `docs/oauth-setup.md`.</p>
        </section>

        <section id="troubleshooting" className="mt-4 card p-5">
          <h2 className="text-lg font-semibold">Troubleshooting</h2>
          <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
            <li>- If processing seems stuck, check worker and python-tts logs under `.runtime/logs/`.</li>
            <li>- If OAuth is unavailable, verify provider env vars and callback URLs.</li>
            <li>- If extension capture fails, reconnect token from dashboard and retry.</li>
          </ul>
        </section>

        <MarketingCta />
      </div>
    </main>
  );
}
