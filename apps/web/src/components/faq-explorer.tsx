"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type {
  FaqAnswerBlock,
  FaqQuestion,
  FaqSection,
  FaqTopicFilterId,
  FaqTopicId,
  FaqTopicOption,
} from "@/lib/faq-page-content";

type FaqExplorerProps = {
  sections: ReadonlyArray<FaqSection>;
  topicOptions: ReadonlyArray<FaqTopicOption>;
};

function setHash(hash: string) {
  if (typeof window === "undefined") {
    return;
  }
  const nextUrl = `${window.location.pathname}${window.location.search}#${hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function questionMatchesSearch(
  question: FaqQuestion,
  sectionTitle: string,
  normalizedSearch: string,
  topicLabelLookup: Readonly<Record<FaqTopicId, string>>,
): boolean {
  if (!normalizedSearch) {
    return true;
  }

  const searchableText = [
    sectionTitle,
    question.question,
    question.schemaAnswer,
    ...question.chips.map((chip) => topicLabelLookup[chip]),
    ...question.blocks.flatMap((block) => {
      if (block.type === "paragraph") {
        return [block.text];
      }
      if (block.type === "bullets") {
        return [...block.items];
      }
      return block.items.map((item) => item.label);
    }),
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(normalizedSearch);
}

function renderBlock(block: FaqAnswerBlock, key: string) {
  if (block.type === "paragraph") {
    return (
      <p key={key} className="text-sm leading-6 text-[var(--muted)]">
        {block.text}
      </p>
    );
  }

  if (block.type === "bullets") {
    return (
      <ul key={key} className="space-y-2 text-sm text-[var(--muted)]">
        {block.items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div key={key} className="flex flex-wrap gap-2">
      {block.items.map((item) => (
        <Link
          key={`${item.href}-${item.label}`}
          className="inline-flex rounded-full border border-[rgba(31,122,90,0.12)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:border-[rgba(31,122,90,0.28)] hover:bg-[var(--accent-soft)]/30"
          href={item.href}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function FaqExplorer({ sections, topicOptions }: FaqExplorerProps) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [activeTopic, setActiveTopic] = useState<FaqTopicFilterId>("all");
  const [openQuestionIds, setOpenQuestionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const normalizedSearch = deferredSearch.trim().toLowerCase();

  const topicLabelLookup = useMemo(
    () =>
      topicOptions.reduce<Record<FaqTopicId, string>>((lookup, option) => {
        if (option.id !== "all") {
          lookup[option.id] = option.label;
        }
        return lookup;
      }, {} as Record<FaqTopicId, string>),
    [topicOptions],
  );

  const questionIds = useMemo(
    () => sections.flatMap((section) => section.questions.map((question) => question.id)),
    [sections],
  );

  const filteredSections = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          questions: section.questions.filter((question) => {
            const matchesTopic =
              activeTopic === "all" || question.chips.includes(activeTopic);
            const matchesSearch = questionMatchesSearch(
              question,
              section.title,
              normalizedSearch,
              topicLabelLookup,
            );
            return matchesTopic && matchesSearch;
          }),
        }))
        .filter((section) => section.questions.length > 0),
    [activeTopic, normalizedSearch, sections, topicLabelLookup],
  );

  const totalQuestionCount = useMemo(
    () => sections.reduce((count, section) => count + section.questions.length, 0),
    [sections],
  );
  const filteredQuestionCount = useMemo(
    () =>
      filteredSections.reduce(
        (count, section) => count + section.questions.length,
        0,
      ),
    [filteredSections],
  );

  useEffect(() => {
    const knownQuestionIds = new Set(questionIds);

    const syncHash = () => {
      const currentHash = window.location.hash.replace(/^#/, "");
      if (!knownQuestionIds.has(currentHash)) {
        return;
      }

      setOpenQuestionIds((current) => {
        if (current.has(currentHash)) {
          return current;
        }
        const next = new Set(current);
        next.add(currentHash);
        return next;
      });
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [questionIds]);

  const updateQuestionOpenState = (questionId: string) => {
    setOpenQuestionIds((current) => {
      const next = new Set(current);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
        setHash(questionId);
      }
      return next;
    });
  };

  const ensureQuestionOpen = (questionId: string) => {
    setOpenQuestionIds((current) => {
      if (current.has(questionId)) {
        return current;
      }
      const next = new Set(current);
      next.add(questionId);
      return next;
    });
  };

  return (
    <>
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold">Browse by topic</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Start with the area that matters most, then narrow things down if
              you need something specific.
            </p>
          </div>
          <p className="text-sm text-[var(--muted)]">
            {filteredQuestionCount} of {totalQuestionCount} questions
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {topicOptions.map((option) => {
            const isActive = option.id === activeTopic;
            return (
              <button
                key={option.id}
                aria-pressed={isActive}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "border-[#8fcdbb] bg-[#edf8f5] text-[#155240]"
                    : "border-[rgba(31,42,31,0.12)] bg-white text-[var(--muted)] hover:border-[rgba(31,42,31,0.2)] hover:text-[var(--ink)]"
                }`}
                onClick={() => setActiveTopic(option.id)}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-xl border border-[rgba(31,122,90,0.12)] bg-[var(--surface)]/70 p-3">
          <label className="space-y-2">
            <span className="text-sm font-medium">Need something specific?</span>
            <input
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search privacy, pricing, PDFs, or digests"
              value={search}
            />
          </label>
        </div>
      </section>

      <div className="mt-8 space-y-8">
        {filteredSections.length === 0 ? (
          <section className="card p-5">
            <h2 className="text-lg font-semibold">No matching questions yet</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Try a different search term, or switch back to All to browse the
              full FAQ.
            </p>
          </section>
        ) : (
          filteredSections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-24 space-y-3"
              aria-labelledby={`faq-${section.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2
                  id={`faq-${section.id}`}
                  className="text-xl font-semibold sm:text-2xl"
                >
                  {section.title}
                </h2>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4d7b72]">
                  {section.questions.length} question
                  {section.questions.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="space-y-3">
                {section.questions.map((question) => {
                  const isOpen = openQuestionIds.has(question.id);
                  const answerId = `${question.id}-answer`;
                  return (
                    <article
                      key={question.id}
                      id={question.id}
                      className={`card scroll-mt-24 p-4 transition ${
                        isOpen ? "border-[rgba(31,122,90,0.22)]" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          aria-controls={answerId}
                          aria-expanded={isOpen}
                          className="flex-1 text-left text-sm font-semibold sm:text-base"
                          onClick={() => updateQuestionOpenState(question.id)}
                          type="button"
                        >
                          {question.question}
                        </button>
                        <a
                          aria-label={`Link to ${question.question}`}
                          className="rounded-full border border-[rgba(31,42,31,0.12)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] transition hover:border-[rgba(31,42,31,0.2)] hover:text-[var(--ink)]"
                          href={`#${question.id}`}
                          onClick={() => ensureQuestionOpen(question.id)}
                        >
                          Link
                        </a>
                      </div>

                      {isOpen ? (
                        <div
                          id={answerId}
                          className="mt-3 space-y-3"
                        >
                          {question.blocks.map((block, index) =>
                            renderBlock(block, `${question.id}-${index}`),
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
