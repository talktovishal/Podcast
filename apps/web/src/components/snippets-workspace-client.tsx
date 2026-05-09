"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type SnippetView = {
  id: string;
  sourceUrl: string;
  sourceTitle: string | null;
  selectedText: string;
  selectedHtml: string | null;
  selectionMarkdown: string | null;
  contextMarkdown: string | null;
  captureMarkdown: string | null;
  pageMetadata: {
    canonicalUrl?: string;
    siteName?: string;
    description?: string;
    author?: string;
    byline?: string;
    publishedAt?: string;
    language?: string;
    imageUrl?: string;
    sectionHeadings?: string[];
  } | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  initialSnippets: SnippetView[];
};

const REFRESH_INTERVAL_MS = 20000;

function mergeSnippetsPreservingNewest(
  current: SnippetView[],
  incoming: SnippetView[],
): SnippetView[] {
  const byId = new Map(current.map((snippet) => [snippet.id, snippet]));
  for (const snippet of incoming) {
    byId.set(snippet.id, snippet);
  }
  return [...byId.values()].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime() ||
      new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime() ||
      left.id.localeCompare(right.id),
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function sourceLabel(snippet: SnippetView): string {
  if (snippet.sourceTitle?.trim()) {
    return snippet.sourceTitle.trim();
  }

  if (snippet.pageMetadata?.siteName?.trim()) {
    return snippet.pageMetadata.siteName.trim();
  }

  try {
    return new URL(snippet.sourceUrl).host;
  } catch {
    return snippet.sourceUrl;
  }
}

function metadataSummary(snippet: SnippetView): string[] {
  const values = [
    snippet.pageMetadata?.siteName?.trim() || null,
    snippet.pageMetadata?.author?.trim() ||
      snippet.pageMetadata?.byline?.trim() ||
      null,
    snippet.pageMetadata?.publishedAt?.trim() || null,
    snippet.pageMetadata?.language?.trim() || null,
  ].filter((value): value is string => Boolean(value));

  return values;
}

export function SnippetsWorkspaceClient({ initialSnippets }: Props) {
  const router = useRouter();
  const [snippets, setSnippets] = useState(initialSnippets);
  const [draftComments, setDraftComments] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        initialSnippets.map((snippet) => [snippet.id, snippet.comment ?? ""]),
      ),
  );
  const [saveBusyId, setSaveBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [openCommentIds, setOpenCommentIds] = useState<Record<string, boolean>>(
    {},
  );
  const [openDetailIds, setOpenDetailIds] = useState<Record<string, boolean>>(
    {},
  );

  const newestFirst = useMemo(
    () =>
      [...snippets].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime() ||
          new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime() ||
          left.id.localeCompare(right.id),
      ),
    [snippets],
  );

  useEffect(() => {
    setDraftComments((current) => {
      const next: Record<string, string> = {};
      for (const snippet of snippets) {
        next[snippet.id] = Object.prototype.hasOwnProperty.call(
          current,
          snippet.id,
        )
          ? current[snippet.id]
          : (snippet.comment ?? "");
      }
      return next;
    });
  }, [snippets]);

  useEffect(() => {
    if (snippets.length === 0) {
      router.replace("/app");
    }
  }, [router, snippets.length]);

  useEffect(() => {
    const refreshSnippets = async () => {
      const response = await fetch(`/api/snippets?limit=100&t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        ok?: boolean;
        snippets?: SnippetView[];
      };
      if (!payload.ok || !Array.isArray(payload.snippets)) {
        return;
      }
      const nextSnippets = payload.snippets;
      setSnippets((current) =>
        nextSnippets.length === 0
          ? []
          : mergeSnippetsPreservingNewest(current, nextSnippets).slice(0, 100),
      );
    };

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshSnippets();
      }
    };

    const interval = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, []);

  async function saveComment(snippetId: string) {
    setSaveBusyId(snippetId);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/snippets/${snippetId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          comment: draftComments[snippetId] ?? "",
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error_message?: string;
        snippet?: SnippetView;
      };
      if (!response.ok || !payload.ok || !payload.snippet) {
        throw new Error(
          payload.error_message || "Unable to save snippet comment.",
        );
      }
      const snippet = payload.snippet;

      setSnippets((current) =>
        current.map((currentSnippet) =>
          currentSnippet.id === snippetId ? snippet : currentSnippet,
        ),
      );
      setDraftComments((current) => ({
        ...current,
        [snippetId]: snippet.comment ?? "",
      }));
      setOpenCommentIds((current) => ({
        ...current,
        [snippetId]: false,
      }));
      setStatusMessage("Snippet comment saved.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Unable to save snippet comment.",
      );
    } finally {
      setSaveBusyId(null);
    }
  }

  async function deleteSnippet(snippetId: string) {
    setDeleteBusyId(snippetId);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/snippets/${snippetId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error_message?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error_message || "Unable to delete snippet.");
      }

      setSnippets((current) =>
        current.filter((snippet) => snippet.id !== snippetId),
      );
      setDraftComments((current) => {
        const next = { ...current };
        delete next[snippetId];
        return next;
      });
      setOpenCommentIds((current) => {
        const next = { ...current };
        delete next[snippetId];
        return next;
      });
      setOpenDetailIds((current) => {
        const next = { ...current };
        delete next[snippetId];
        return next;
      });
      setStatusMessage("Snippet deleted.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Unable to delete snippet.",
      );
    } finally {
      setDeleteBusyId(null);
    }
  }

  return (
    <section className="space-y-3">
      {statusMessage ? (
        <p className="rounded-lg border border-[rgba(31,122,90,0.14)] bg-[rgba(223,243,236,0.32)] px-3 py-2 text-sm text-[var(--accent)]">
          {statusMessage}
        </p>
      ) : null}

      {newestFirst.length === 0 ? (
        <div className="card p-4 sm:p-5">
          <h3 className="text-base font-semibold">No snippets yet</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            After the extension is connected, select text on any page and use
            the right-click menu to save it here.
          </p>
        </div>
      ) : null}

      {newestFirst.map((snippet) => {
        const draftComment = draftComments[snippet.id] ?? "";
        const normalizedSavedComment = snippet.comment ?? "";
        const snippetMetadata = metadataSummary(snippet);
        const isDirty = draftComment !== normalizedSavedComment;
        const isSaveBusy = saveBusyId === snippet.id;
        const isDeleteBusy = deleteBusyId === snippet.id;

        return (
          <article key={snippet.id} className="card p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                  Snippet
                </p>
                <h3 className="mt-1 text-base font-semibold text-[var(--ink)]">
                  {sourceLabel(snippet)}
                </h3>
              </div>
              <p className="text-sm text-[var(--muted)]">
                {formatDate(snippet.createdAt)}
              </p>
            </div>

            <Link
              href={snippet.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex text-sm text-[var(--accent)] underline-offset-4 hover:underline"
            >
              {snippet.sourceUrl}
            </Link>

            <blockquote className="mt-3 whitespace-pre-wrap rounded-xl border border-[rgba(31,42,31,0.08)] bg-[rgba(223,243,236,0.26)] p-3 text-sm leading-6 text-[var(--ink)]">
              {snippet.selectedText}
            </blockquote>

            <div className="mt-3 flex flex-wrap gap-2">
              {openCommentIds[snippet.id] ? (
                <>
                  <button
                    type="button"
                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void saveComment(snippet.id)}
                    disabled={!isDirty || isSaveBusy || isDeleteBusy}
                  >
                    {isSaveBusy ? "Saving..." : "Save comment"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[rgba(31,42,31,0.12)] px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() =>
                      setDraftComments((current) => ({
                        ...current,
                        [snippet.id]: snippet.comment ?? "",
                      }))
                    }
                    disabled={!isDirty || isSaveBusy || isDeleteBusy}
                  >
                    Reset
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="rounded-lg border border-[rgba(31,42,31,0.12)] px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() =>
                    setOpenCommentIds((current) => ({
                      ...current,
                      [snippet.id]: true,
                    }))
                  }
                  disabled={isSaveBusy || isDeleteBusy}
                >
                  {normalizedSavedComment ? "Edit comment" : "Add comment"}
                </button>
              )}
              {openCommentIds[snippet.id] ? (
                <button
                  type="button"
                  className="rounded-lg border border-[rgba(31,42,31,0.12)] px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:border-slate-300 hover:bg-slate-50"
                  onClick={() =>
                    setOpenCommentIds((current) => ({
                      ...current,
                      [snippet.id]: false,
                    }))
                  }
                >
                  Close comment
                </button>
              ) : null}
              {snippetMetadata.length > 0 ||
              snippet.pageMetadata?.description ||
              snippet.pageMetadata?.sectionHeadings?.length ||
              snippet.contextMarkdown ||
              snippet.captureMarkdown ? (
                <button
                  type="button"
                  className="rounded-lg border border-[rgba(31,42,31,0.12)] px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:border-slate-300 hover:bg-slate-50"
                  onClick={() =>
                    setOpenDetailIds((current) => ({
                      ...current,
                      [snippet.id]: !current[snippet.id],
                    }))
                  }
                >
                  {openDetailIds[snippet.id]
                    ? "Hide capture details"
                    : "Capture details"}
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-lg border border-[rgba(120,53,15,0.18)] px-3 py-2 text-sm font-medium text-[rgb(120,53,15)] transition hover:bg-[rgba(255,237,213,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void deleteSnippet(snippet.id)}
                disabled={isDeleteBusy || isSaveBusy}
              >
                {isDeleteBusy ? "Deleting..." : "Delete"}
              </button>
            </div>

            {openCommentIds[snippet.id] ? (
              <label className="mt-3 block">
                <span className="sr-only">Comment</span>
                <textarea
                  className="min-h-24 w-full rounded-xl border border-[rgba(31,42,31,0.12)] bg-white px-3 py-2 text-sm text-[var(--ink)] shadow-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[rgba(31,122,90,0.16)]"
                  value={draftComment}
                  onChange={(event) =>
                    setDraftComments((current) => ({
                      ...current,
                      [snippet.id]: event.target.value,
                    }))
                  }
                  placeholder="Why did you save this?"
                />
              </label>
            ) : null}

            {openDetailIds[snippet.id] ? (
              <div className="mt-3 space-y-3 rounded-xl border border-[rgba(31,42,31,0.08)] bg-[rgba(255,255,255,0.7)] p-3">
                {snippetMetadata.length > 0 ? (
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                    {snippetMetadata.join(" • ")}
                  </p>
                ) : null}

                {snippet.pageMetadata?.description ? (
                  <p className="text-sm leading-6 text-[var(--muted)]">
                    {snippet.pageMetadata.description}
                  </p>
                ) : null}

                {snippet.pageMetadata?.sectionHeadings?.length ? (
                  <p className="text-sm text-[var(--muted)]">
                    Section path:{" "}
                    {snippet.pageMetadata.sectionHeadings.join(" > ")}
                  </p>
                ) : null}

                {snippet.contextMarkdown ? (
                  <div>
                    <p className="text-sm font-medium text-[var(--ink)]">
                      Captured context
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">
                      {snippet.contextMarkdown}
                    </pre>
                  </div>
                ) : null}

                {snippet.captureMarkdown ? (
                  <div>
                    <p className="text-sm font-medium text-[var(--ink)]">
                      Structured capture
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">
                      {snippet.captureMarkdown}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
