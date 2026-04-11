"use client";

import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
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

type WikiSourcePreview = {
  key: string;
  title: string;
  href: string | null;
  snippet: string;
};

const GROUP_ORDER = ["root", "concepts", "entities", "outputs"];
const SOURCE_PREVIEW_LIMIT = 5;
const SOURCE_SNIPPET_CHAR_LIMIT = 220;
const CLAMPED_PREVIEW_STYLE = {
  display: "-webkit-box",
  overflow: "hidden",
  WebkitBoxOrient: "vertical" as const,
  WebkitLineClamp: 2,
};
const UPDATED_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const SUPPORTING_SOURCE_ENTRY_RE = /^\s*(?:[-*+]\s+|\d+\.\s+|\(\d+\)\s+)?\[[^\]]+\]\([^)]+\)/;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/;

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

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[`*_>#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateSourceSnippet(text: string): string {
  if (text.length <= SOURCE_SNIPPET_CHAR_LIMIT) {
    return text;
  }
  return `${text.slice(0, SOURCE_SNIPPET_CHAR_LIMIT - 3).trimEnd()}...`;
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

function buildSupportingSourcePreviews(entries: string[]): WikiSourcePreview[] {
  return entries.map((entry, index) => {
    const withoutPrefix = entry.replace(/^\s*(?:[-*+]\s+|\d+\.\s+|\(\d+\)\s+)?/, "");
    const linkMatch = MARKDOWN_LINK_RE.exec(withoutPrefix);
    const rawTitle = linkMatch?.[1]?.trim() || `Source ${index + 1}`;
    const href = linkMatch?.[2]?.trim() || null;
    const afterLink = linkMatch
      ? withoutPrefix.slice((linkMatch.index || 0) + linkMatch[0].length).replace(/^[-:–—\s]+/, "")
      : withoutPrefix;
    const snippet = truncateSourceSnippet(stripInlineMarkdown(afterLink || withoutPrefix.replace(rawTitle, "")));

    return {
      key: `${index}-${rawTitle}`,
      title: rawTitle,
      href,
      snippet,
    };
  });
}

function buildReferenceSourcePreviews(referenceLinks: WikiReferenceLink[]): WikiSourcePreview[] {
  return referenceLinks.map((reference) => ({
    key: reference.key,
    title: reference.title,
    href: reference.url,
    snippet: reference.updated ? `Updated ${formatUpdatedDate(reference.updated)}` : "",
  }));
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
  const [showAllSources, setShowAllSources] = useState(false);
  useEffect(() => {
    setShowAllSources(false);
  }, [activePage.path]);
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
  const sourcePreviews =
    supportingEntries.length > 0
      ? buildSupportingSourcePreviews(supportingEntries)
      : buildReferenceSourcePreviews(referenceLinks);
  const visibleSourcePreviews = showAllSources
    ? sourcePreviews
    : sourcePreviews.slice(0, SOURCE_PREVIEW_LIMIT);
  const hasSources = supportingNotes.length > 0 || referenceLinks.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(16rem,19rem)_minmax(0,1fr)]">
      <aside>
        <section className="card p-3 sm:p-3.5">
          <div className="space-y-3">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold text-lg">Explore wiki</h2>
                <span className="rounded-full border border-[rgba(31,122,90,0.14)] bg-[rgba(31,122,90,0.08)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                  {browsePages.length} pages
                </span>
              </div>
              <input
                className="w-full rounded-xl border border-[rgba(31,122,90,0.18)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[rgba(31,122,90,0.42)] focus:ring-2 focus:ring-[rgba(31,122,90,0.12)]"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search this wiki"
                type="search"
                value={query}
              />
            </div>

            <div className="space-y-2.5">
              {groups.size === 0 ? (
                <p className="text-sm text-[var(--muted)]">No wiki pages match the current filter.</p>
              ) : (
                [...groups.entries()]
                  .sort(([left], [right]) => {
                    const groupDiff = groupSortValue(left) - groupSortValue(right);
                    return groupDiff !== 0 ? groupDiff : left.localeCompare(right);
                  })
                  .map(([groupKey, pages]) => (
                    <div key={groupKey} className="space-y-1.5">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        {groupLabel(groupKey)}
                      </h3>
                      <div className="space-y-0.5">
                        {pages
                          .sort((left, right) => pageSortValue(left).localeCompare(pageSortValue(right)))
                          .map((page) => {
                            const active = page.path === activePage.path;
                            return (
                              <Link
                                key={page.path}
                                className={`block rounded-xl px-2.5 py-2 transition ${
                                  active
                                    ? "bg-[rgba(31,122,90,0.08)] ring-1 ring-[rgba(31,122,90,0.22)]"
                                    : "bg-transparent hover:bg-[rgba(247,251,250,0.9)]"
                                }`}
                                href={page.routePath}
                              >
                                <div className="text-sm font-medium text-[var(--foreground)]">{page.title}</div>
                                {page.summary ? (
                                  <div
                                    className="mt-0.5 text-xs leading-5 text-[var(--muted)]"
                                    style={CLAMPED_PREVIEW_STYLE}
                                  >
                                    {page.summary}
                                  </div>
                                ) : null}
                              </Link>
                            );
                          })}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </section>
      </aside>

      <div className="space-y-5">
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

        <section className="card p-4 sm:p-5">
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
          {hasSources ? (
            <div className="mt-5 border-t border-[rgba(31,122,90,0.12)] pt-3">
              <h2 className="text-base font-semibold text-[var(--foreground)]">Sources</h2>
              <ol className="mt-2 list-decimal space-y-1.5 pl-6 marker:font-medium marker:text-[rgba(31,122,90,1)]">
                {visibleSourcePreviews.map((source) => {
                  const resolved = source.href ? resolveRenderedLink(manifest, source.href) : null;
                  const previewBody = (
                    <>
                      {resolved ? (
                        resolved.external ? (
                          <a
                            className="font-medium text-[rgba(31,122,90,1)] underline underline-offset-2"
                            href={resolved.href}
                            rel="noreferrer"
                            target={resolved.href.startsWith("http") ? "_blank" : undefined}
                          >
                            {source.title}
                          </a>
                        ) : (
                          <Link className="font-medium text-[rgba(31,122,90,1)] underline underline-offset-2" href={resolved.href}>
                            {source.title}
                          </Link>
                        )
                      ) : (
                        <span className="font-medium text-[var(--foreground)]">{source.title}</span>
                      )}
                      {source.snippet ? (
                        <p
                          className="mt-0.5 text-sm leading-5 text-[var(--muted)]"
                          style={CLAMPED_PREVIEW_STYLE}
                        >
                          {source.snippet}
                        </p>
                      ) : null}
                    </>
                  );

                  return (
                    <li
                      key={source.key}
                      className="border-b border-[rgba(31,122,90,0.12)] pb-1.5 last:border-b-0 last:pb-0"
                    >
                      {previewBody}
                    </li>
                  );
                })}
              </ol>

              {sourcePreviews.length > SOURCE_PREVIEW_LIMIT ? (
                <button
                  className="mt-3 inline-flex text-sm font-medium text-[rgba(31,122,90,1)] underline underline-offset-2"
                  onClick={() => setShowAllSources((current) => !current)}
                  type="button"
                >
                  {showAllSources ? "Show fewer" : `Show all ${sourcePreviews.length} sources`}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        {activeBacklinks.length > 0 ? (
          <section className="card p-4 sm:p-5">
            <h2 className="font-semibold text-lg">Related pages</h2>
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              {activeBacklinks.map((page) => (
                <Link
                  key={page.path}
                  className="rounded-xl border border-[rgba(31,122,90,0.14)] bg-[rgba(247,251,250,0.84)] px-3 py-2.5 transition hover:border-[rgba(31,122,90,0.24)] hover:bg-white"
                  href={page.routePath}
                >
                  <div className="text-sm font-medium">{page.title}</div>
                  {page.summary ? (
                    <div
                      className="mt-0.5 text-xs leading-5 text-[var(--muted)]"
                      style={CLAMPED_PREVIEW_STYLE}
                    >
                      {page.summary}
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
