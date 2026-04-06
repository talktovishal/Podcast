export type ProductProofPill = {
  label: string;
  detail: string;
};

export const productProofPills = [
  { label: "Save from", detail: "URLs" },
  { label: "Bring along", detail: "PDFs" },
  { label: "Capture with", detail: "Chrome capture" },
  { label: "Listen in", detail: "Private RSS" },
  { label: "Recap with", detail: "Weekly digests" },
] as const satisfies ReadonlyArray<ProductProofPill>;

export type ProductRecommendationCard = {
  title: string;
  statement: string;
  outcome: string;
};

export const productRecommendationCards = [
  {
    title: "Finish more saved reading",
    statement:
      "The things worth saving stop sitting in a read-later pile and start showing up as episodes you can actually get through.",
    outcome: "Turns good intentions into finished listening.",
  },
  {
    title: "Keep learning inside your routine",
    statement:
      "The output fits the podcast habit you already have, so catching up on thoughtful articles feels closer to pressing play than opening another queue.",
    outcome: "Moves article catch-up into a familiar playback flow.",
  },
  {
    title: "Retain the pieces that matter",
    statement:
      "Source-grounded episodes plus weekly digests make it easier to remember what stood out instead of losing the thread across scattered tabs.",
    outcome: "Supports reading, listening, and later recall together.",
  },
  {
    title: "Revisit the original source when needed",
    statement:
      "You are not choosing between speed and fidelity because saved items keep the original article or PDF close at hand for a deeper pass later.",
    outcome: "Lets listening accelerate, not replace, careful reading.",
  },
  {
    title: "Make backlog feel calmer",
    statement:
      "A private feed creates one listening destination for the reading you care about, so your backlog feels curated instead of endless.",
    outcome: "Creates a steadier system for ongoing learning.",
  },
] as const satisfies ReadonlyArray<ProductRecommendationCard>;

type GifStoryMedia = {
  type: "gif";
  frameLabel: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  caption: string;
};

type PlaceholderStoryMedia = {
  type: "placeholder";
  frameLabel: string;
  caption: string;
  alt: string;
  kicker: string;
  headline: string;
  bullets: readonly string[];
};

export type ProductStoryMedia = GifStoryMedia | PlaceholderStoryMedia;

export type ProductStoryBlock = {
  step: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: readonly string[];
  media: ProductStoryMedia;
};

export const productStoryBlocks = [
  {
    step: "01",
    eyebrow: "Save when the article still has your attention",
    title:
      "Catch reading in the moment instead of promising to come back later",
    body: "Paste a URL, upload a text-based PDF, or use the Chrome extension when the page is already open. The fastest capture path should feel close enough to the moment that you actually use it.",
    bullets: [
      "Start from the article or PDF you already wanted to keep.",
      "Use Chrome capture when you are already on the page.",
      "Move the source into a listening workflow before it disappears into tabs.",
    ],
    media: {
      type: "gif",
      frameLabel: "Real workflow clip",
      src: "/resources/articlepod-extension-flow.gif",
      alt: "Animated walkthrough of the ArticlePod Chrome extension connect and capture flow.",
      width: 800,
      height: 1027,
      caption:
        "The first live story block uses the current Chrome extension walkthrough so the page shows a real workflow, not only abstract product claims.",
    },
  },
  {
    step: "02",
    eyebrow: "Let the output match your playback habit",
    title: "Private podcast delivery keeps the finish line familiar",
    body: "ArticlePod is useful because it ends in a private podcast feed, not another inbox to maintain. The payoff is hearing saved reading in the player you already trust for the rest of your listening life.",
    bullets: [
      "Each saved item becomes a private episode when processing finishes.",
      "Your podcast queue stays the main place you come back to.",
      "Playback, seeking, and resuming stay aligned with standard podcast app behavior.",
    ],
    media: {
      type: "placeholder",
      frameLabel: "Workflow clip coming soon",
      alt: "Placeholder frame for a future private podcast feed workflow clip.",
      kicker: "Future story slot",
      headline: "Show the article-to-episode handoff inside a podcast queue",
      bullets: [
        "Episode appears inside a personal feed.",
        "Playback starts in a familiar app.",
        "The reading backlog becomes a listening queue.",
      ],
      caption:
        "This slot is designed for a future clip focused on the handoff from saved source to private podcast playback.",
    },
  },
  {
    step: "03",
    eyebrow: "Add a recap layer when individual episodes are not enough",
    title: "Weekly digests help you keep the throughline, not just the backlog",
    body: "Single-item episodes handle the day-to-day queue. Weekly digests add a higher-level recap when you want the bigger picture across what you saved, heard, and want to retain.",
    bullets: [
      "Keep per-item listening for the pieces worth finishing in full.",
      "Use digest-style recaps when you want highlights together.",
      "Stay close to the original sources while still getting synthesis.",
    ],
    media: {
      type: "placeholder",
      frameLabel: "Workflow clip coming soon",
      alt: "Placeholder frame for a future weekly digest workflow clip.",
      kicker: "Future story slot",
      headline: "Show how weekly digests turn scattered saves into one recap",
      bullets: [
        "Saved items roll into a digest-ready set.",
        "Highlights become one recap experience.",
        "The week feels easier to revisit.",
      ],
      caption:
        "This slot is reserved for a future digest-story clip so the page can expand without another layout rewrite.",
    },
  },
] as const satisfies ReadonlyArray<ProductStoryBlock>;

export const productTrustHighlights = [
  {
    title: "Private by default",
    description:
      "Podcast access stays tied to private feed delivery instead of pushing your saved reading onto a public listening surface.",
  },
  {
    title: "Source-grounded",
    description:
      "Episodes stay anchored to the original article or PDF so listening can lead back to the source whenever you want the full text.",
  },
  {
    title: "Built for standard podcast behavior",
    description:
      "The workflow is stronger because it fits normal podcast playback habits rather than asking you to adopt a brand-new listening destination.",
  },
] as const;
