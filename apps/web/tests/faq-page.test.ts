import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildFaqPageContent,
  flattenFaqQuestionsForSchema,
} from "../src/lib/faq-page-content";

const faqPageSource = readFileSync(
  new URL("../src/app/(marketing)/faq/page.tsx", import.meta.url),
  "utf8",
);
const faqExplorerSource = readFileSync(
  new URL("../src/components/faq-explorer.tsx", import.meta.url),
  "utf8",
);
const faqContent = buildFaqPageContent({
  freeTrialSubmissionLimit: 2,
  proMonthlyDailyPodcastLimit: 12,
  proMonthlyWeeklySummaryLimit: 5,
  proAnnualDailyPodcastLimit: 15,
  proAnnualWeeklySummaryLimit: 10,
});

test("faq page keeps the refreshed hero copy and delegates interactive rendering to the explorer", () => {
  assert.equal(faqPageSource.includes("Common questions, answered"), true);
  assert.equal(
    faqPageSource.includes(
      "ArticlePod is built around private per-article podcast episodes, with optional weekly digests when you want an easy recap.",
    ),
    true,
  );
  assert.equal(faqPageSource.includes("FaqExplorer"), true);
  assert.equal(faqPageSource.includes("buildFaqPageContent"), true);
  assert.equal(faqPageSource.includes("flattenFaqQuestionsForSchema"), true);
});

test("faq content uses conversion-focused questions, topic chips, and richer answer blocks", () => {
  assert.deepEqual(
    faqContent.sections.map((section) => section.title),
    [
      "Getting started",
      "Inputs & capture",
      "Privacy & feed",
      "Podcast apps",
      "Account & access",
    ],
  );
  assert.deepEqual(
    faqContent.topicOptions.map((topic) => topic.label),
    [
      "All",
      "Getting started",
      "Pricing",
      "Privacy",
      "Podcast apps",
      "Chrome",
      "PDFs",
      "Digests",
    ],
  );

  const questions = faqContent.sections.flatMap((section) =>
    section.questions.map((question) => question.question),
  );

  assert.equal(questions.includes("What happens when I save something?"), true);
  assert.equal(
    questions.includes("What's included in Starter vs Pro?"),
    true,
  );
  assert.equal(
    questions.includes(
      "Can I use email and Google, Apple, or Facebook with the same account?",
    ),
    true,
  );
  assert.equal(
    questions.includes(
      "What happens if a page is messy, blocked, or a scanned PDF?",
    ),
    true,
  );
  assert.equal(
    questions.includes("Why can processing take longer for large inputs?"),
    false,
  );
  assert.equal(
    questions.includes("Do I also get a reading version?"),
    false,
  );

  const starterVsPro = faqContent.sections
    .flatMap((section) => section.questions)
    .find((question) => question.id === "question-starter-vs-pro");
  assert.ok(starterVsPro);
  assert.equal(
    starterVsPro.blocks.some((block) => block.type === "bullets"),
    true,
  );
  assert.equal(
    starterVsPro.blocks.some((block) => block.type === "links"),
    true,
  );
});

test("faq explorer keeps compact topic filters and deep-linkable questions", () => {
  assert.equal(faqExplorerSource.includes("Browse by topic"), true);
  assert.equal(faqExplorerSource.includes("Need something specific?"), false);
  assert.equal(
    faqExplorerSource.includes(
      'placeholder="Search privacy, pricing, PDFs, or digests"',
    ),
    false,
  );
  assert.equal(faqExplorerSource.includes("useDeferredValue"), false);
  assert.equal(faqExplorerSource.includes("aria-pressed"), true);
  assert.equal(faqExplorerSource.includes("hashchange"), true);
  assert.equal(faqExplorerSource.includes("Link to ${question.question}"), true);
});

test("faq schema stays flat even though rendered answers are richer", () => {
  const schemaItems = flattenFaqQuestionsForSchema(faqContent.sections);
  assert.equal(schemaItems.length, 15);
  assert.deepEqual(schemaItems[0], {
    question: "What happens when I save something?",
    answer:
      "Usually one save becomes one private podcast episode. Save a URL, upload a text-based PDF, or capture a page in Chrome, and ArticlePod processes it into an episode that appears in your private feed when it is ready.",
  });
  assert.equal(
    schemaItems.some(
      (item) => item.question === "What happens if I need to rotate my feed URL?",
    ),
    true,
  );
});
