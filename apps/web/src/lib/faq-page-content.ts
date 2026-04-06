export type FaqSectionId =
  | "getting-started"
  | "inputs-capture"
  | "privacy-feed"
  | "podcast-apps"
  | "account-access";

export type FaqTopicId =
  | "getting-started"
  | "pricing"
  | "privacy"
  | "podcast-apps"
  | "chrome"
  | "pdfs"
  | "digests";

export type FaqTopicFilterId = "all" | FaqTopicId;

export type FaqAnswerBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: ReadonlyArray<string> }
  | { type: "links"; items: ReadonlyArray<{ label: string; href: string }> };

export type FaqQuestion = {
  id: string;
  question: string;
  chips: ReadonlyArray<FaqTopicId>;
  schemaAnswer: string;
  blocks: ReadonlyArray<FaqAnswerBlock>;
};

export type FaqSection = {
  id: FaqSectionId;
  title: string;
  questions: ReadonlyArray<FaqQuestion>;
};

export type QuickAnswer = {
  label: string;
  helperText?: string;
  href: `#${FaqSectionId}`;
};

export type FaqTopicOption = {
  id: FaqTopicFilterId;
  label: string;
};

export type FaqPageContent = {
  description: string;
  quickAnswers: ReadonlyArray<QuickAnswer>;
  topicOptions: ReadonlyArray<FaqTopicOption>;
  sections: ReadonlyArray<FaqSection>;
};

export function buildFaqPageContent(input: {
  freeTrialSubmissionLimit: number;
  proMonthlyDailyPodcastLimit: number;
  proMonthlyWeeklySummaryLimit: number;
  proAnnualDailyPodcastLimit: number;
  proAnnualWeeklySummaryLimit: number;
}): FaqPageContent {
  return {
    description:
      "Common questions about private article podcasts, Starter and Pro pricing, private feed access, Chrome capture, PDFs, weekly digests, and podcast app support.",
    quickAnswers: [
      {
        label: "One save becomes one episode",
        helperText: "Getting started",
        href: "#getting-started",
      },
      {
        label: "URLs, PDFs, and Chrome capture",
        helperText: "Inputs & capture",
        href: "#inputs-capture",
      },
      {
        label: "Private feed URL you control",
        helperText: "Privacy & feed",
        href: "#privacy-feed",
      },
      {
        label: "Integrates with standard podcast apps",
        helperText: "Podcast apps",
        href: "#podcast-apps",
      },
    ],
    topicOptions: [
      { id: "all", label: "All" },
      { id: "getting-started", label: "Getting started" },
      { id: "pricing", label: "Pricing" },
      { id: "privacy", label: "Privacy" },
      { id: "podcast-apps", label: "Podcast apps" },
      { id: "chrome", label: "Chrome" },
      { id: "pdfs", label: "PDFs" },
      { id: "digests", label: "Digests" },
    ],
    sections: [
      {
        id: "getting-started",
        title: "Getting started",
        questions: [
          {
            id: "question-save-something",
            question: "What happens when I save something?",
            chips: ["getting-started"],
            schemaAnswer:
              "Usually one save becomes one private podcast episode. Save a URL, upload a text-based PDF, or capture a page in Chrome, and ArticlePod processes it into an episode that appears in your private feed when it is ready.",
            blocks: [
              {
                type: "paragraph",
                text: "Usually one save becomes one private podcast episode. Save a URL, upload a text-based PDF, or capture a page in Chrome, and ArticlePod turns it into something you can play in your normal listening flow.",
              },
              {
                type: "bullets",
                items: [
                  "Each save becomes its own episode instead of being buried in a batch export.",
                  "When processing finishes, the episode appears in your private feed like any other podcast item.",
                  "If something cannot be processed cleanly, you see a clear error instead of a silent miss.",
                ],
              },
              {
                type: "links",
                items: [
                  { label: "See the product overview", href: "/product" },
                  { label: "Start your knowledge feed", href: "/" },
                ],
              },
            ],
          },
          {
            id: "question-chrome-extension",
            question: "Do I need the Chrome extension?",
            chips: ["getting-started", "chrome"],
            schemaAnswer:
              "No. The Chrome extension is the fastest capture path when you already have a page open, but you can also paste a URL or upload a text-based PDF in the web app.",
            blocks: [
              {
                type: "paragraph",
                text: "No. The Chrome extension is the fastest capture path when you already have a page open, but it is not required.",
              },
              {
                type: "bullets",
                items: [
                  "Paste a URL in the web app when you already have a link.",
                  "Upload a text-based PDF when the source is already on your computer.",
                  "Use the extension when you want the quickest path from reading in Chrome to listening later.",
                ],
              },
              {
                type: "links",
                items: [
                  { label: "See capture options", href: "/resources" },
                ],
              },
            ],
          },
          {
            id: "question-try-free",
            question: "Can I try ArticlePod for free?",
            chips: ["getting-started", "pricing"],
            schemaAnswer: `Yes. Starter lets you create an account and try ArticlePod with ${input.freeTrialSubmissionLimit} free submissions before deciding whether you want Pro capacity and digest options.`,
            blocks: [
              {
                type: "paragraph",
                text: "Yes. Starter lets you create an account and try the workflow before you decide whether you want more capacity.",
              },
              {
                type: "bullets",
                items: [
                  `Starter includes ${input.freeTrialSubmissionLimit} free submissions so you can test ArticlePod on your own reading.`,
                  "You still get URL and PDF ingestion plus a private RSS feed.",
                  "Upgrade later if you want higher daily capacity, weekly digests, and Chrome capture as part of the paid workflow.",
                ],
              },
              {
                type: "links",
                items: [
                  { label: "Compare plans", href: "/pricing" },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "inputs-capture",
        title: "Inputs & capture",
        questions: [
          {
            id: "question-what-can-i-save",
            question: "What can I save with ArticlePod?",
            chips: ["getting-started", "chrome", "pdfs"],
            schemaAnswer:
              "Most people use ArticlePod for article URLs, text-based PDFs, and readable pages they already have open in Chrome.",
            blocks: [
              {
                type: "paragraph",
                text: "Most people use ArticlePod for article URLs, text-based PDFs, and readable pages they already have open in Chrome.",
              },
              {
                type: "bullets",
                items: [
                  "Article URLs for standard web reading.",
                  "Text-based PDFs for reports, briefs, and long-form documents.",
                  "Chrome captures when the browser view is the cleanest version of the page.",
                ],
              },
              {
                type: "links",
                items: [
                  { label: "Read more about capture", href: "/resources" },
                ],
              },
            ],
          },
          {
            id: "question-messy-page-or-scanned-pdf",
            question: "What happens if a page is messy, blocked, or a scanned PDF?",
            chips: ["chrome", "pdfs"],
            schemaAnswer:
              "ArticlePod works best with readable source material. Text-based PDFs are supported, scanned PDFs are not yet, and messy or blocked pages fail with a clear message instead of a mystery result.",
            blocks: [
              {
                type: "paragraph",
                text: "ArticlePod works best with readable source material. If a source is too messy, blocked, or image-only, you get a clear result instead of a mystery failure.",
              },
              {
                type: "bullets",
                items: [
                  "Text-based PDFs are supported today.",
                  "Scanned or image-heavy PDFs are not supported yet.",
                  "If a direct fetch is messy, the Chrome extension can be the better path when the page already looks right in your browser.",
                ],
              },
              {
                type: "links",
                items: [
                  { label: "See capture guidance", href: "/resources" },
                ],
              },
            ],
          },
          {
            id: "question-how-fast-episodes",
            question: "How fast are episodes usually ready?",
            chips: ["getting-started"],
            schemaAnswer:
              "Most shorter saves are ready quickly. Longer articles and PDFs can take a little more time, but they still land in your feed automatically when processing finishes.",
            blocks: [
              {
                type: "paragraph",
                text: "Most shorter saves are ready quickly. Longer articles and PDFs can take a little more time, but they still land in your feed automatically when processing finishes.",
              },
              {
                type: "bullets",
                items: [
                  "Shorter articles are usually the fastest to process.",
                  "Long-form pieces and larger PDFs naturally take longer.",
                  "You do not need to keep the page open while ArticlePod works.",
                ],
              },
              {
                type: "links",
                items: [
                  { label: "See plan capacity", href: "/pricing" },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "privacy-feed",
        title: "Privacy & feed",
        questions: [
          {
            id: "question-private-feed",
            question: "Is my feed private?",
            chips: ["privacy", "podcast-apps"],
            schemaAnswer:
              "Yes. Your feed uses a private URL meant only for you and the podcast apps you choose to connect, and normal account activity does not rotate it behind your back.",
            blocks: [
              {
                type: "paragraph",
                text: "Yes. Your feed uses a private URL meant only for you and the podcast apps you choose to connect.",
              },
              {
                type: "bullets",
                items: [
                  "Treat the feed URL like a password.",
                  "Normal account activity does not rotate it behind your back.",
                  "If you ever need to replace it, you can do that intentionally and reconnect the new URL in your podcast app.",
                ],
              },
              {
                type: "links",
                items: [
                  { label: "Read the product overview", href: "/product" },
                ],
              },
            ],
          },
          {
            id: "question-rotate-feed-url",
            question: "What happens if I need to rotate my feed URL?",
            chips: ["privacy", "podcast-apps"],
            schemaAnswer:
              "You can rotate your feed URL when needed, but it is intentional because your podcast app will need the replacement link. Rotation invalidates the old URL and gives you a new one to add back to your app.",
            blocks: [
              {
                type: "paragraph",
                text: "You can rotate your feed URL when needed, but it is an intentional action because your podcast app will need the replacement link.",
              },
              {
                type: "bullets",
                items: [
                  "Your feed stays stable during normal use.",
                  "Rotation invalidates the old URL.",
                  "After rotating, copy the new feed URL into the podcast apps you want to keep using.",
                ],
              },
            ],
          },
          {
            id: "question-audio-retention",
            question: "How long do you keep generated audio?",
            chips: ["privacy"],
            schemaAnswer:
              "Generated episode audio stays available for 60 days after publication. After that, ArticlePod removes expired audio from active feeds and playback links.",
            blocks: [
              {
                type: "paragraph",
                text: "Generated episode audio stays available for 60 days after publication.",
              },
              {
                type: "bullets",
                items: [
                  "Expired audio is removed from active feeds and playback links.",
                  "That keeps storage focused on recent listening instead of becoming permanent file hosting.",
                ],
              },
            ],
          },
        ],
      },
      {
        id: "podcast-apps",
        title: "Podcast apps",
        questions: [
          {
            id: "question-podcast-apps",
            question: "Which podcast apps work with ArticlePod?",
            chips: ["podcast-apps"],
            schemaAnswer:
              "If your app supports private RSS feeds, ArticlePod should fit right in. Apple Podcasts, YouTube Music, and other standard RSS-capable apps work.",
            blocks: [
              {
                type: "paragraph",
                text: "If your app supports private RSS feeds, ArticlePod should fit right in.",
              },
              {
                type: "bullets",
                items: [
                  "Apple Podcasts and YouTube Music work well.",
                  "Other standard RSS-capable podcast apps are supported too.",
                  "Playback keeps the basics people expect, including seeking and resume behavior.",
                ],
              },
              {
                type: "links",
                items: [
                  { label: "See the product fit", href: "/product" },
                ],
              },
            ],
          },
          {
            id: "question-normal-podcast-routine",
            question: "Does it fit my normal podcast routine?",
            chips: ["podcast-apps"],
            schemaAnswer:
              "Yes. ArticlePod is meant to feel like part of your normal listening queue, so you can keep using the podcast app you already know instead of learning a separate reading workflow.",
            blocks: [
              {
                type: "paragraph",
                text: "Yes. ArticlePod is built to feel like part of your normal listening queue, not a separate habit you have to maintain.",
              },
              {
                type: "bullets",
                items: [
                  "Listen in the podcast app you already use.",
                  "Pick up where you left off and scrub through episodes normally.",
                  "Apps that support downloads and offline listening handle ArticlePod the same way they handle other private RSS podcasts.",
                ],
              },
            ],
          },
          {
            id: "question-episodes-vs-digests",
            question: "What's the difference between per-article episodes and weekly digests?",
            chips: ["podcast-apps", "digests", "pricing"],
            schemaAnswer:
              "Per-article episodes are the main experience: one save becomes one episode. Weekly digests are optional recap episodes and email summaries when you want a lighter overview across multiple saves.",
            blocks: [
              {
                type: "paragraph",
                text: "Per-article episodes are the main experience. Weekly digests are optional recap episodes and email summaries when you want a lighter overview across multiple saves.",
              },
              {
                type: "bullets",
                items: [
                  "Per-article episodes are best when you want to hear the full piece.",
                  "Weekly digests are better when you want highlights across what you saved.",
                  "Digest options are available when you upgrade to Pro.",
                ],
              },
              {
                type: "links",
                items: [
                  { label: "See how plans differ", href: "/pricing" },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "account-access",
        title: "Account & access",
        questions: [
          {
            id: "question-starter-vs-pro",
            question: "What's included in Starter vs Pro?",
            chips: ["pricing", "chrome", "digests"],
            schemaAnswer: `Starter is for trying the workflow with ${input.freeTrialSubmissionLimit} free submissions. Pro Monthly includes ${input.proMonthlyDailyPodcastLimit} new podcast episodes per day, ${input.proMonthlyWeeklySummaryLimit} manual summaries every 7 days, Chrome capture, and weekly digest options, while Pro Annual raises that to ${input.proAnnualDailyPodcastLimit} daily episodes and ${input.proAnnualWeeklySummaryLimit} manual summaries every 7 days.`,
            blocks: [
              {
                type: "paragraph",
                text: "Starter is for trying the workflow. Pro is for regular listening with more daily capacity and digest options.",
              },
              {
                type: "bullets",
                items: [
                  `Starter: ${input.freeTrialSubmissionLimit} free submissions, URL and PDF ingestion, and a private RSS feed.`,
                  `Pro Monthly: ${input.proMonthlyDailyPodcastLimit} new podcast episodes per day, ${input.proMonthlyWeeklySummaryLimit} manual summaries every 7 days, Chrome capture, and weekly digest podcast plus email options.`,
                  `Pro Annual: ${input.proAnnualDailyPodcastLimit} new podcast episodes per day, ${input.proAnnualWeeklySummaryLimit} manual summaries every 7 days, with the strongest value for habitual use.`,
                ],
              },
              {
                type: "links",
                items: [
                  { label: "Compare Starter and Pro", href: "/pricing" },
                ],
              },
            ],
          },
          {
            id: "question-sign-in-methods",
            question: "Can I use email and Google, Apple, or Facebook with the same account?",
            chips: ["getting-started"],
            schemaAnswer:
              "Yes. Email login works by default, and Google, Apple, and Facebook sign-in can also be enabled. The goal is one account with flexible sign-in methods, not separate feeds for separate providers.",
            blocks: [
              {
                type: "paragraph",
                text: "Yes. ArticlePod is designed around one account with flexible sign-in methods, not separate feeds for separate providers.",
              },
              {
                type: "bullets",
                items: [
                  "Email login works by default.",
                  "Google, Apple, and Facebook sign-in can also be enabled.",
                  "Your account stays centered on the same listening setup instead of splitting by provider.",
                ],
              },
            ],
          },
          {
            id: "question-share-single-episode",
            question: "Can I share a single episode without sharing my whole feed?",
            chips: ["privacy", "podcast-apps"],
            schemaAnswer:
              "Yes. You can create a public share link for one episode without exposing your private RSS feed, and that share link can be revoked later.",
            blocks: [
              {
                type: "paragraph",
                text: "Yes. You can share one episode without exposing your whole private feed.",
              },
              {
                type: "bullets",
                items: [
                  "Share links are scoped to a single episode.",
                  "You can revoke them later.",
                  "Your main private RSS feed stays private.",
                ],
              },
              {
                type: "links",
                items: [
                  { label: "See how sharing works", href: "/product" },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function flattenFaqQuestionsForSchema(
  sections: ReadonlyArray<FaqSection>,
): ReadonlyArray<{ question: string; answer: string }> {
  return sections.flatMap((section) =>
    section.questions.map((question) => ({
      question: question.question,
      answer: question.schemaAnswer,
    })),
  );
}
