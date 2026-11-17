export function WikiSnapshotPreview({
  className = "",
}: {
  className?: string;
}) {
  return (
    <section
      className={`rounded-[24px] border border-[rgba(31,122,90,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(242,249,246,0.98))] p-3 shadow-[0_16px_34px_rgba(20,38,30,0.06)] sm:p-4 ${className}`.trim()}
    >
      <div className="flex flex-col gap-2 border-b border-[rgba(31,122,90,0.12)] pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
            Wiki Snapshot
          </p>
          <h3 className="text-lg font-semibold text-[var(--ink)]">
            What the personal wiki becomes
          </h3>
          <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
            A weekly rebuild pulls articles, PDFs, and snippets into one
            durable page you can browse later instead of reconstructing the
            same context from scratch.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex rounded-full border border-[#cfe7df] bg-[#edf8f5] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#155240]">
            782 linked pages
          </span>
          <span className="inline-flex rounded-full border border-[rgba(31,122,90,0.12)] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4d7b72]">
            Updated weekly
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(12rem,13rem)_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[rgba(31,122,90,0.1)] bg-white/92 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
            Linked pages
          </p>
          <div className="mt-2 grid gap-2">
            {[
              ["Concept", "Tool calling"],
              ["Concept", "Agent loops"],
              ["Concept", "Memory systems"],
              ["Concept", "Prompt caching"],
              ["Entity", "OpenAI models"],
              ["Entity", "Eval harness"],
              ["Output", "Failure modes"],
              ["Output", "Research backlog"],
            ].map(([kind, label]) => (
              <div
                key={label}
                className="rounded-xl border border-[rgba(31,122,90,0.1)] bg-[rgba(247,251,250,0.96)] px-3 py-2"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4d7b72]">
                  {kind}
                </p>
                <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </aside>

        <article className="rounded-2xl border border-[rgba(31,122,90,0.12)] bg-white/94 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                Concept page
              </p>
              <h4 className="mt-0.5 text-xl font-semibold text-[var(--ink)]">
                Context Engineering
              </h4>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                A real page feels less like a chat answer and more like a
                durable working note with links, source coverage, and an
                evolving point of view.
              </p>
            </div>
            <span className="inline-flex max-w-fit rounded-full border border-[#cfe7df] bg-[#edf8f5] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#155240]">
              782 linked pages
            </span>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="rounded-2xl border border-[rgba(31,122,90,0.1)] bg-[rgba(247,251,250,0.96)] p-3">
              <h5 className="border-b border-[rgba(31,122,90,0.18)] pb-1 text-sm font-semibold text-[#155240]">
                Executive summary
              </h5>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-[var(--muted)]">
                <li>Saved sources turn into one persistent page instead of one-off answers.</li>
                <li>Cross-links make related concepts easier to revisit and compare.</li>
                <li>Weekly rebuilds keep newer evidence attached to the same page.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-[rgba(31,122,90,0.1)] bg-[rgba(255,255,255,0.98)] p-3">
              <h5 className="border-b border-[rgba(31,122,90,0.18)] pb-1 text-sm font-semibold text-[#155240]">
                Working synthesis
              </h5>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Instead of re-discovering the same fragments at query time, the
                wiki keeps a durable interpretation of what your saved reading
                is actually saying, where the disagreements are, and which
                ideas connect across sources.
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(14rem,16rem)]">
            <div className="rounded-2xl border border-dashed border-[rgba(31,122,90,0.18)] bg-[rgba(244,251,248,0.94)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                Compiled from
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  "Karpathy note",
                  "Research PDF",
                  "Browser snippets",
                  "Source notes",
                  "Product docs",
                ].map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-[rgba(31,122,90,0.12)] bg-white px-3 py-1 text-xs font-medium text-[var(--ink)]"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[rgba(31,122,90,0.1)] bg-[rgba(247,251,250,0.96)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                Page signals
              </p>
              <div className="mt-2 space-y-2 text-sm text-[var(--muted)]">
                {[
                  "46 source notes merged",
                  "12 contradictions tracked",
                  "Weekly rebuild complete",
                ].map((label) => (
                  <p key={label} className="rounded-xl bg-white px-3 py-2">
                    {label}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
