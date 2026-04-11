"use client";

import { useDeferredValue, useState, type ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { WikiManifest, WikiPageMeta } from "@articlepod/core";

type WikiBrowserClientProps = {
  manifest: WikiManifest;
  activePage: WikiPageMeta;
  content: string;
};

function groupLabel(groupKey: string): string {
  switch (groupKey) {
    case "root":
      return "Top level";
    case "concepts":
      return "Concepts";
    case "entities":
      return "Entities";
    case "outputs":
      return "Outputs";
    case "sources":
      return "Sources";
    default:
      return groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
  }
}

function pageDepth(page: WikiPageMeta): number {
  return Math.max(0, page.path.split("/").length - 1);
}

function backlinkPages(manifest: WikiManifest, activePage: WikiPageMeta): WikiPageMeta[] {
  return activePage.backlinks
    .map((path) => manifest.pages.find((page) => page.path === path) || null)
    .filter((page): page is WikiPageMeta => Boolean(page));
}

function sourcePages(manifest: WikiManifest, activePage: WikiPageMeta): WikiPageMeta[] {
  if (activePage.sourceIds.length === 0) {
    return [];
  }

  return manifest.pages.filter(
    (page) =>
      page.path !== activePage.path &&
      (page.type === "source_item" || page.type === "source_snippet") &&
      page.sourceIds.some((sourceId) => activePage.sourceIds.includes(sourceId))
  );
}

function TagPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[rgba(31,122,90,0.14)] bg-[rgba(31,122,90,0.08)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)]">
      {children}
    </span>
  );
}

export function WikiBrowserClient({ manifest, activePage, content }: WikiBrowserClientProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const filteredPages = manifest.pages.filter((page) => {
    if (!deferredQuery) {
      return true;
    }
    return [page.title, page.summary || "", page.tags.join(" "), page.path].some((value) =>
      value.toLowerCase().includes(deferredQuery)
    );
  });
  const groups = new Map<string, WikiPageMeta[]>();

  for (const page of filteredPages) {
    const segments = page.path.split("/");
    const groupKey = segments.length > 1 ? segments[0] || "root" : "root";
    const current = groups.get(groupKey) ?? [];
    current.push(page);
    groups.set(groupKey, current);
  }

  const activeBacklinks = backlinkPages(manifest, activePage);
  const relatedSources = sourcePages(manifest, activePage);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="card p-4 sm:p-5">
          <div className="space-y-3">
            <div>
              <h2 className="font-semibold text-lg">Browse wiki</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Filter by title, tags, summary, or page path.
              </p>
            </div>

            <input
              className="w-full rounded-2xl border border-[rgba(31,122,90,0.18)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[rgba(31,122,90,0.42)] focus:ring-2 focus:ring-[rgba(31,122,90,0.12)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this wiki"
              type="search"
              value={query}
            />

            <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
              <span>{manifest.pages.length} pages</span>
              <span>{manifest.sourceState.counts.items} item sources</span>
              <span>{manifest.sourceState.counts.snippets} snippets</span>
            </div>
          </div>
        </section>

        <section className="card p-4 sm:p-5">
          <div className="space-y-4">
            {groups.size === 0 ? (
              <p className="text-sm text-[var(--muted)]">No wiki pages match the current filter.</p>
            ) : (
              [...groups.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([groupKey, pages]) => (
                  <div key={groupKey} className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      {groupLabel(groupKey)}
                    </h3>
                    <div className="space-y-1.5">
                      {pages
                        .sort((left, right) => left.path.localeCompare(right.path))
                        .map((page) => {
                          const active = page.path === activePage.path;
                          return (
                            <Link
                              key={page.path}
                              className={`block rounded-2xl border px-3 py-2 transition ${
                                active
                                  ? "border-[rgba(31,122,90,0.24)] bg-[rgba(31,122,90,0.08)]"
                                  : "border-transparent bg-[rgba(247,251,250,0.8)] hover:border-[rgba(31,122,90,0.14)] hover:bg-white"
                              }`}
                              href={page.routePath}
                              style={{ marginLeft: `${pageDepth(page) * 10}px` }}
                            >
                              <div className="text-sm font-medium text-[var(--foreground)]">{page.title}</div>
                              <div className="mt-0.5 truncate font-mono text-[11px] text-[var(--muted)]">{page.path}</div>
                            </Link>
                          );
                        })}
                    </div>
                  </div>
                ))
            )}
          </div>
        </section>
      </aside>

      <div className="space-y-6">
        <section className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-bold text-2xl">{activePage.title}</h1>
                <TagPill>{activePage.type}</TagPill>
              </div>
              {activePage.summary ? <p className="text-sm text-[var(--muted)]">{activePage.summary}</p> : null}
              <div className="flex flex-wrap gap-2">
                {activePage.tags.map((tag) => (
                  <TagPill key={tag}>{tag}</TagPill>
                ))}
              </div>
            </div>

            <div className="space-y-1 text-right text-xs text-[var(--muted)]">
              <div className="font-mono">{activePage.path}</div>
              {activePage.updated ? <div>Updated {activePage.updated}</div> : null}
              {activePage.sourceUrl ? (
                <a
                  className="inline-flex text-[rgba(31,122,90,1)] underline underline-offset-2"
                  href={activePage.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open original source
                </a>
              ) : null}
            </div>
          </div>
        </section>

        <section className="card p-4 sm:p-6">
          <article className="prose prose-sm max-w-none prose-a:text-[rgba(31,122,90,1)] prose-headings:text-[var(--foreground)] prose-p:text-[var(--foreground)] sm:prose-base">
            <ReactMarkdown
              rehypePlugins={[rehypeSanitize]}
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children, ...props }) => {
                  const targetHref = href || "";
                  if (targetHref.startsWith("/app/wiki")) {
                    return (
                      <Link className="font-medium text-[rgba(31,122,90,1)] underline underline-offset-2" href={targetHref}>
                        {children}
                      </Link>
                    );
                  }

                  return (
                    <a
                      {...props}
                      className="font-medium text-[rgba(31,122,90,1)] underline underline-offset-2"
                      href={targetHref}
                      rel="noreferrer"
                      target={targetHref.startsWith("http") ? "_blank" : undefined}
                    >
                      {children}
                    </a>
                  );
                }
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        </section>

        {relatedSources.length > 0 ? (
          <section className="card p-4 sm:p-5">
            <h2 className="font-semibold text-lg">Source pages</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {relatedSources.map((page) => (
                <Link
                  key={page.path}
                  className="rounded-full border border-[rgba(31,122,90,0.16)] px-3 py-1.5 text-sm text-[rgba(31,122,90,1)] transition hover:bg-[rgba(31,122,90,0.08)]"
                  href={page.routePath}
                >
                  {page.title}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {activeBacklinks.length > 0 ? (
          <section className="card p-4 sm:p-5">
            <h2 className="font-semibold text-lg">Backlinks</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {activeBacklinks.map((page) => (
                <Link
                  key={page.path}
                  className="rounded-2xl border border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.84)] px-4 py-3 transition hover:border-[rgba(31,122,90,0.24)] hover:bg-white"
                  href={page.routePath}
                >
                  <div className="text-sm font-medium">{page.title}</div>
                  {page.summary ? <div className="mt-1 text-sm text-[var(--muted)]">{page.summary}</div> : null}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
