"use client";

import { useDeferredValue, useState, type ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { WikiManifest, WikiPageMeta } from "@articlepod/core";
import { splitWikiMarkdownForDisplay } from "@/lib/wiki-display";

type WikiBrowserClientProps = {
  manifest: WikiManifest;
  activePage: WikiPageMeta;
  content: string;
};

type WikiReferenceLink = {
  key: string;
  title: string;
  url: string;
  updated: string | null;
};

const GROUP_ORDER = ["root", "concepts", "entities", "outputs"];
const UPDATED_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const SUPPORTING_SOURCE_ENTRY_RE = /^\s*(?:[-*+]\s+|\d+\.\s+|\(\d+\)\s+)?\[[^\]]+\]\([^)]+\)/;

function isSourcePage(page: Pick<WikiPageMeta, "path" | "type">): boolean {
  return (
    page.type === "source_item" ||
    page.type === "source_snippet" ||
    page.path.startsWith("sources/items/") ||
    page.path.startsWith("sources/snippets/")
  );
}

function isReaderFacingPage(page: WikiPageMeta): boolean {
  return !isSourcePage(page) && page.type !== "log";
}

function groupKeyForPage(page: WikiPageMeta): string {
  const segments = page.path.split("/");
  return segments.length > 1 ? segments[0] || "root" : "root";
}

function groupLabel(groupKey: string): string {
  switch (groupKey) {
    case "root":
      return "Main pages";
    case "concepts":
      return "Concepts";
    case "entities":
      return "Entities";
    case "outputs":
      return "Collections";
    default:
      return groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
  }
}

function groupSortValue(groupKey: string): number {
  const index = GROUP_ORDER.indexOf(groupKey);
  return index === -1 ? GROUP_ORDER.length : index;
}

function pageSortValue(page: WikiPageMeta): string {
  if (page.path === "index.md") {
    return "0-index";
  }
  if (page.path === "overview.md") {
    return "1-overview";
  }
  return `9-${page.title.toLowerCase()}`;
}

function humanizeTypeLabel(type: string): string | null {
  switch (type) {
    case "concept":
      return "Concept";
    case "entity":
      return "Entity";
    case "output":
      return "Collection";
    case "overview":
      return "Overview";
    case "source_item":
    case "source_snippet":
      return "Reference";
    default:
      return null;
  }
}

function backlinkPages(manifest: WikiManifest, activePage: WikiPageMeta): WikiPageMeta[] {
  return activePage.backlinks
    .map((path) => manifest.pages.find((page) => page.path === path) || null)
    .filter((page): page is WikiPageMeta => Boolean(page))
    .filter(isReaderFacingPage);
}

function relatedSourceReferences(manifest: WikiManifest, activePage: WikiPageMeta): WikiReferenceLink[] {
  if (activePage.sourceIds.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  return manifest.pages
    .filter(
      (page) =>
        page.path !== activePage.path &&
        isSourcePage(page) &&
        page.sourceIds.some((sourceId) => activePage.sourceIds.includes(sourceId)) &&
        Boolean(page.sourceUrl)
    )
    .map((page) => ({
      key: page.path,
      title: page.sourceTitle || page.title,
      url: page.sourceUrl || "",
      updated: page.updated,
    }))
    .filter((reference) => {
      const dedupeKey = `${reference.title}::${reference.url}`;
      if (!reference.url || seen.has(dedupeKey)) {
        return false;
      }
      seen.add(dedupeKey);
      return true;
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

function formatUpdatedDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return UPDATED_DATE_FORMAT.format(date);
}

function resolveRenderedLink(manifest: WikiManifest, href: string): { external: boolean; href: string } {
  const routeHref = href.split("#", 1)[0] || href;
  const targetPage = manifest.pages.find((page) => page.routePath === routeHref) || null;

  if (targetPage && isSourcePage(targetPage) && targetPage.sourceUrl) {
    return { external: true, href: targetPage.sourceUrl };
  }

  if (href.startsWith("/app/wiki")) {
    return { external: false, href };
  }

  return { external: href.startsWith("http"), href };
}

function splitSupportingNotesIntoEntries(supportingNotes: string[]): string[] {
  const entries: string[] = [];

  for (const note of supportingNotes) {
    const lines = note.split("\n");
    let current: string[] = [];
    let sawExplicitEntry = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (SUPPORTING_SOURCE_ENTRY_RE.test(trimmed)) {
        if (current.length > 0) {
          entries.push(current.join("\n").trim());
        }
        current = [trimmed];
        sawExplicitEntry = true;
        continue;
      }

      if (current.length === 0) {
        current = [line];
        continue;
      }

      current.push(line);
    }

    if (current.length > 0) {
      entries.push(current.join("\n").trim());
      continue;
    }

    if (!sawExplicitEntry && note.trim()) {
      entries.push(note.trim());
    }
  }

  return entries.filter(Boolean);
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
  const browsePages = manifest.pages.filter(isReaderFacingPage);
  const filteredPages = browsePages.filter((page) => {
    if (!deferredQuery) {
      return true;
    }
    return [page.title, page.summary || "", page.tags.join(" "), page.sourceTitle || ""].some((value) =>
      value.toLowerCase().includes(deferredQuery)
    );
  });
  const groups = new Map<string, WikiPageMeta[]>();

  for (const page of filteredPages) {
    const groupKey = groupKeyForPage(page);
    const current = groups.get(groupKey) ?? [];
    current.push(page);
    groups.set(groupKey, current);
  }

  const activeBacklinks = backlinkPages(manifest, activePage);
  const referenceLinks = relatedSourceReferences(manifest, activePage);
  const activeTypeLabel = humanizeTypeLabel(activePage.type);
  const { articleMarkdown, supportingNotes } = splitWikiMarkdownForDisplay(content);
  const renderedArticleMarkdown =
    articleMarkdown || (supportingNotes.length === 0 ? content : activePage.summary || "");
  const supportingEntries = splitSupportingNotesIntoEntries(supportingNotes);
  const hasExpandableSources = supportingNotes.length > 0 || referenceLinks.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="card p-4 sm:p-5">
          <div className="space-y-3">
            <div>
              <h2 className="font-semibold text-lg">Explore wiki</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Search by page title, summary, or topic.
              </p>
            </div>

            <input
              className="w-full rounded-2xl border border-[rgba(31,122,90,0.18)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[rgba(31,122,90,0.42)] focus:ring-2 focus:ring-[rgba(31,122,90,0.12)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this wiki"
              type="search"
              value={query}
            />

            <p className="text-xs text-[var(--muted)]">
              {browsePages.length} reader-friendly pages
            </p>
          </div>
        </section>

        <section className="card p-4 sm:p-5">
          <div className="space-y-4">
            {groups.size === 0 ? (
              <p className="text-sm text-[var(--muted)]">No wiki pages match the current filter.</p>
            ) : (
              [...groups.entries()]
                .sort(([left], [right]) => {
                  const groupDiff = groupSortValue(left) - groupSortValue(right);
                  return groupDiff !== 0 ? groupDiff : left.localeCompare(right);
                })
                .map(([groupKey, pages]) => (
                  <div key={groupKey} className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      {groupLabel(groupKey)}
                    </h3>
                    <div className="space-y-1.5">
                      {pages
                        .sort((left, right) => pageSortValue(left).localeCompare(pageSortValue(right)))
                        .map((page) => {
                          const active = page.path === activePage.path;
                          return (
                            <Link
                              key={page.path}
                              className={`block rounded-2xl border px-3 py-3 transition ${
                                active
                                  ? "border-[rgba(31,122,90,0.24)] bg-[rgba(31,122,90,0.08)]"
                                  : "border-transparent bg-[rgba(247,251,250,0.8)] hover:border-[rgba(31,122,90,0.14)] hover:bg-white"
                              }`}
                              href={page.routePath}
                            >
                              <div className="text-sm font-medium text-[var(--foreground)]">{page.title}</div>
                              {page.summary ? (
                                <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{page.summary}</div>
                              ) : null}
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
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-bold text-2xl">{activePage.title}</h1>
                {activeTypeLabel ? <TagPill>{activeTypeLabel}</TagPill> : null}
              </div>
              {activePage.summary ? <p className="max-w-3xl text-sm text-[var(--muted)]">{activePage.summary}</p> : null}
              {activePage.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activePage.tags.map((tag) => (
                    <TagPill key={tag}>{tag}</TagPill>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-1 text-right text-xs text-[var(--muted)]">
              {activePage.updated ? <div>Updated {formatUpdatedDate(activePage.updated)}</div> : null}
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
                  const resolved = resolveRenderedLink(manifest, targetHref);

                  if (!resolved.external && resolved.href.startsWith("/app/wiki")) {
                    return (
                      <Link className="font-medium text-[rgba(31,122,90,1)] underline underline-offset-2" href={resolved.href}>
                        {children}
                      </Link>
                    );
                  }

                  return (
                    <a
                      {...props}
                      className="font-medium text-[rgba(31,122,90,1)] underline underline-offset-2"
                      href={resolved.href}
                      rel="noreferrer"
                      target={resolved.href.startsWith("http") ? "_blank" : undefined}
                    >
                      {children}
                    </a>
                  );
                }
              }}
            >
              {renderedArticleMarkdown}
            </ReactMarkdown>
          </article>
        </section>

        {hasExpandableSources ? (
          <section className="card p-4 sm:p-5">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.84)] px-4 py-3 text-left transition hover:border-[rgba(31,122,90,0.24)] hover:bg-white">
                <span className="font-semibold text-lg text-[var(--foreground)]">Sources</span>
                <span className="text-xs text-[var(--muted)] group-open:hidden">Show</span>
                <span className="hidden text-xs text-[var(--muted)] group-open:inline">Hide</span>
              </summary>

              {supportingEntries.length > 0 ? (
                <ol className="mt-4 space-y-3">
                  {supportingEntries.map((note, index) => (
                    <li key={`${activePage.path}-supporting-note-${index}`} className="flex items-start gap-3">
                      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[rgba(31,122,90,0.18)] bg-[rgba(31,122,90,0.08)] text-xs font-semibold text-[rgba(31,122,90,1)]">
                        {index + 1}
                      </span>
                      <article className="min-w-0 flex-1 rounded-2xl border border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.84)] px-4 py-3">
                        <div className="prose prose-sm max-w-none prose-a:text-[rgba(31,122,90,1)] prose-p:text-[var(--foreground)]">
                          <ReactMarkdown
                            rehypePlugins={[rehypeSanitize]}
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ href, children, ...props }) => {
                                const targetHref = href || "";
                                const resolved = resolveRenderedLink(manifest, targetHref);

                                if (!resolved.external && resolved.href.startsWith("/app/wiki")) {
                                  return (
                                    <Link className="font-medium text-[rgba(31,122,90,1)] underline underline-offset-2" href={resolved.href}>
                                      {children}
                                    </Link>
                                  );
                                }

                                return (
                                  <a
                                    {...props}
                                    className="font-medium text-[rgba(31,122,90,1)] underline underline-offset-2"
                                    href={resolved.href}
                                    rel="noreferrer"
                                    target={resolved.href.startsWith("http") ? "_blank" : undefined}
                                  >
                                    {children}
                                  </a>
                                );
                              }
                            }}
                          >
                            {note}
                          </ReactMarkdown>
                        </div>
                      </article>
                    </li>
                  ))}
                </ol>
              ) : (
                <ol className="mt-4 space-y-3">
                  {referenceLinks.map((reference, index) => (
                    <li key={reference.key} className="flex items-start gap-3">
                      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[rgba(31,122,90,0.18)] bg-[rgba(31,122,90,0.08)] text-xs font-semibold text-[rgba(31,122,90,1)]">
                        {index + 1}
                      </span>
                      <a
                        className="min-w-0 flex-1 rounded-2xl border border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.84)] px-4 py-3 transition hover:border-[rgba(31,122,90,0.24)] hover:bg-white"
                        href={reference.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <div className="text-sm font-medium text-[var(--foreground)]">{reference.title}</div>
                        {reference.updated ? (
                          <div className="mt-1 text-xs text-[var(--muted)]">Updated {formatUpdatedDate(reference.updated)}</div>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </details>
          </section>
        ) : null}

        {activeBacklinks.length > 0 ? (
          <section className="card p-4 sm:p-5">
            <h2 className="font-semibold text-lg">Related pages</h2>
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
