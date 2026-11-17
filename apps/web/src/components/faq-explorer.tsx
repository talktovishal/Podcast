"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  FaqAnswerBlock,
  FaqSection,
} from "@/lib/faq-page-content";

type FaqExplorerProps = {
  sections: ReadonlyArray<FaqSection>;
};

function setHash(hash: string) {
  if (typeof window === "undefined") {
    return;
  }
  const nextUrl = `${window.location.pathname}${window.location.search}#${hash}`;
  window.history.replaceState(null, "", nextUrl);
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

export function FaqExplorer({ sections }: FaqExplorerProps) {
  const [openQuestionIds, setOpenQuestionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const questionIds = useMemo(
    () => sections.flatMap((section) => section.questions.map((question) => question.id)),
    [sections],
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

  return (
    <div className="mt-6 space-y-8">
      {sections.map((section) => (
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
                  <button
                    aria-controls={answerId}
                    aria-expanded={isOpen}
                    className="w-full text-left text-sm font-semibold sm:text-base"
                    onClick={() => updateQuestionOpenState(question.id)}
                    type="button"
                  >
                    {question.question}
                  </button>

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
      ))}
    </div>
  );
}
