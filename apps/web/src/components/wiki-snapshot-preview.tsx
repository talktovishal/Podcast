export function WikiSnapshotPreview({
  className = "",
}: {
  className?: string;
}) {
  return (
    <section
      className={`rounded-[28px] border border-[rgba(31,122,90,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(242,249,246,0.96))] p-4 shadow-[0_18px_40px_rgba(20,38,30,0.06)] sm:p-5 ${className}`.trim()}
    >
      <div className="flex flex-col gap-2 border-b border-[rgba(31,122,90,0.12)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
            Wiki Snapshot
          </p>
          <h3 className="mt-1 text-lg font-semibold text-[var(--ink)]">
            What the personal wiki becomes
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            One concept page pulls together articles, snippets, and PDFs into a
            durable page you can return to later.
          </p>
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#1f7a5a]">
          Articles + PDFs + snippets
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[rgba(31,122,90,0.1)] bg-white/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
            Linked pages
          </p>
          <div className="mt-3 space-y-2">
            {[
              ["Concept", "Agent loops"],
              ["Concept", "Evaluation patterns"],
              ["Entity", "Tooling stack"],
              ["Output", "Open questions"],
            ].map(([kind, label]) => (
              <div
                key={label}
                className="rounded-xl border border-[rgba(31,122,90,0.1)] bg-[rgba(247,251,250,0.92)] px-3 py-2"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4d7b72]">
                  {kind}
                </p>
                <p className="mt-1 text-sm font-medium text-[var(--ink)]">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </aside>

        <article className="rounded-2xl border border-[rgba(31,122,90,0.12)] bg-white/92 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                Concept page
              </p>
              <h4 className="mt-1 text-xl font-semibold text-[var(--ink)]">
                AI Workflow Patterns
              </h4>
            </div>
            <span className="inline-flex max-w-fit rounded-full border border-[#cfe7df] bg-[#edf8f5] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#155240]">
              7 linked pages
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-[rgba(31,122,90,0.1)] bg-[rgba(247,251,250,0.92)] p-4">
            <h5 className="border-b border-[rgba(31,122,90,0.18)] pb-1 text-sm font-semibold text-[#155240]">
              Executive summary
            </h5>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--muted)]">
              <li>Saved sources turn into one persistent page instead of one-off answers.</li>
              <li>Cross-links make related concepts easier to revisit and compare.</li>
              <li>New reading updates the page instead of restarting the synthesis from zero.</li>
            </ul>
          </div>

          <div className="mt-4 rounded-2xl border border-[rgba(31,122,90,0.1)] bg-[rgba(255,255,255,0.96)] p-4">
            <h5 className="border-b border-[rgba(31,122,90,0.18)] pb-1 text-sm font-semibold text-[#155240]">
              Working synthesis
            </h5>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Instead of re-discovering the same fragments at query time, the
              wiki keeps refining a durable interpretation of what your saved
              reading is actually saying and how the ideas connect.
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-dashed border-[rgba(31,122,90,0.18)] bg-[rgba(244,251,248,0.9)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
              Compiled from
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Article", "PDF", "Snippet", "Source notes"].map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-[rgba(31,122,90,0.12)] bg-white px-3 py-1 text-xs font-medium text-[var(--ink)]"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
