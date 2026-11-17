import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanExtractedMarkdown,
  hasNarratableText,
  markdownToNarrationText,
  summaryMarkdownToNarrationText
} from "../src/extract/markdownCleanup";

test("cleanExtractedMarkdown preserves rich source context while removing obvious chrome", () => {
  const cleaned = cleanExtractedMarkdown(`
## Example Story

By Jane Example

March 21, 2026

![Launch photo](https://cdn.example.com/launch.jpg)

See the source appendix at https://example.com/reference-deck for the full chart notes.

The team also linked [Autoresearch](https://example.com/autoresearch) in the article body for readers who want the original project.

[Share](https://example.com/share)

The article body adds enough detail to prove that the stored markdown keeps the useful source context while obvious share chrome disappears before persistence.
`);

  assert.ok(cleaned.includes("By Jane Example"));
  assert.ok(cleaned.includes("March 21, 2026"));
  assert.ok(cleaned.includes("![Launch photo](https://cdn.example.com/launch.jpg)"));
  assert.ok(cleaned.includes("https://example.com/reference-deck"));
  assert.ok(cleaned.includes("[Autoresearch](https://example.com/autoresearch)"));
  assert.ok(!cleaned.includes("[Share]"));
  assert.ok(cleaned.includes("stored markdown keeps the useful source context"));
});

test("cleanExtractedMarkdown normalizes malformed leaked image wrapper fragments into raw urls", () => {
  const cleaned = cleanExtractedMarkdown(`
March 20, 2026

/https://tf-cmsv2-smithsonianmag-media.s3.amazonaws.com/accounts/headshot/Ramsha_Zubairi-edit.png)

:focal(512x336:513x337)/https://tf-cmsv2-smithsonianmag-media.s3.amazonaws.com/filer_public/25/cb/25cb708a-97b2-463b-b3f6-c208632d7dbc/gettyimages-645604187.jpg)

Ramsha Zubairi is a historian of science who studies observatories and archives.

The article opens by explaining how eclipse data changed the way researchers compared sky surveys across decades.
`);

  assert.ok(cleaned.includes("March 20, 2026"));
  assert.ok(cleaned.includes("https://tf-cmsv2-smithsonianmag-media.s3.amazonaws.com/accounts/headshot/Ramsha_Zubairi-edit.png"));
  assert.ok(cleaned.includes("https://tf-cmsv2-smithsonianmag-media.s3.amazonaws.com/filer_public/25/cb/25cb708a-97b2-463b-b3f6-c208632d7dbc/gettyimages-645604187.jpg"));
  assert.ok(!cleaned.includes(":focal("));
  assert.ok(!cleaned.includes("/https://"));
});

test("cleanExtractedMarkdown preserves html tables and decodes entities", () => {
  const cleaned = cleanExtractedMarkdown(`
The harness comparison below was captured from an older stored markdown artifact.

<table><tbody><tr><th><strong>Harness</strong></th><th><strong>Duration</strong></th><th><strong>Cost</strong></th></tr><tr><td>Solo</td><td>20 min</td><td>$9</td></tr><tr><td>Full harness</td><td>6 hr</td><td>$200</td></tr></tbody></table>

Agent &amp; Phase summary stays useful for later inspection.
`);

  assert.ok(cleaned.includes("<table><tbody>"));
  assert.ok(cleaned.includes("<td>Solo</td>"));
  assert.ok(cleaned.includes("Agent & Phase summary stays useful"));
  assert.ok(!cleaned.includes("&amp;"));
});

test("cleanExtractedMarkdown removes nav footer and tag-list junk while keeping body prose", () => {
  const cleaned = cleanExtractedMarkdown(`
Skip to main content

## Thank you for everything you ship. Claude Max is on us.

Open-source maintainers and contributors keep the ecosystem running.

Write

- Help
- Security
- Privacy
- Terms

Cookie settings

English (US)
`);

  assert.ok(cleaned.includes("## Thank you for everything you ship. Claude Max is on us."));
  assert.ok(cleaned.includes("Open-source maintainers and contributors keep the ecosystem running."));
  assert.ok(!cleaned.includes("Skip to main content"));
  assert.ok(!cleaned.includes("Cookie settings"));
  assert.ok(!cleaned.includes("English (US)"));
  assert.ok(!cleaned.includes("- Help"));
});

test("markdownToNarrationText strips metadata urls and image references from rich stored markdown", () => {
  const narration = markdownToNarrationText(`
## Example Story

By Jane Example

March 21, 2026

![Launch photo](https://cdn.example.com/launch.jpg)

See the source appendix at https://example.com/reference-deck for the full chart notes.

The team also linked [Autoresearch](https://example.com/autoresearch) in the article body for readers who want the original project.

The article body adds enough detail to prove that the narration step is where aggressive cleanup now happens, while the saved markdown can stay richer for later reuse.
`);

  assert.ok(!narration.includes("By Jane Example"));
  assert.ok(!narration.includes("March 21, 2026"));
  assert.ok(!narration.includes("cdn.example.com"));
  assert.ok(!narration.includes("https://example.com/reference-deck"));
  assert.ok(narration.includes("The team also linked Autoresearch in the article body"));
  assert.ok(narration.includes("aggressive cleanup now happens"));
});

test("markdownToNarrationText removes normalized raw image urls before speech", () => {
  const cleaned = cleanExtractedMarkdown(`
March 20, 2026

/https://tf-cmsv2-smithsonianmag-media.s3.amazonaws.com/accounts/headshot/Ramsha_Zubairi-edit.png)

:focal(512x336:513x337)/https://tf-cmsv2-smithsonianmag-media.s3.amazonaws.com/filer_public/25/cb/25cb708a-97b2-463b-b3f6-c208632d7dbc/gettyimages-645604187.jpg)

Ramsha Zubairi is a historian of science who studies observatories and archives.

The article opens by explaining how eclipse data changed the way researchers compared sky surveys across decades.
`);

  const narration = markdownToNarrationText(cleaned);
  assert.ok(narration.includes("Ramsha Zubairi is a historian of science"));
  assert.ok(narration.includes("The article opens by explaining how eclipse data changed"));
  assert.ok(!narration.includes("March 20, 2026"));
  assert.ok(!narration.includes("smithsonianmag-media"));
  assert.ok(!narration.includes(".png"));
  assert.ok(!narration.includes(".jpg"));
});

test("markdownToNarrationText strips production-style inline focal wrappers and leading image metadata", () => {
  const narration = markdownToNarrationText(`
## Virginia teenager Mia Heller’s filtration system harnesses the power of ferrofluid, a magnetic oil that binds to microplastics in flowing water

Virginia teenager Mia Heller’s filtration system harnesses the power of ferrofluid, a magnetic oil that binds to microplastics in flowing water / Ramsha Waseem - Freelance writer March 20, 2026 :focal(512x336:513x337)/ A few years ago, teenager Mia Heller came across an article in her local newspaper about ongoing water quality issues in her neighborhood in Warrenton, Virginia.
`);

  assert.ok(narration.includes("A few years ago, teenager Mia Heller came across an article"));
  assert.ok(!narration.includes(":focal("));
  assert.ok(!narration.includes("Ramsha Waseem"));
  assert.ok(!narration.includes("March 20, 2026"));
});

test("markdownToNarrationText flattens html and markdown tables into speakable text", () => {
  const narration = markdownToNarrationText(`
The final test scores are below, and this intentionally long lead paragraph keeps the narration flow anchored in article prose before the table so the cleanup step treats the table as content instead of as front-matter metadata.

<table><thead><tr><th>Mean Rank</th><th>img->txt R@5</th></tr></thead><tbody><tr><td><strong>34.30</strong></td><td><strong>53.0%</strong></td></tr></tbody></table>

| Method | Pros | Cons |
| --- | --- | --- |
| Automated evals | Faster iteration | Up-front investment |

The final paragraph keeps the narration safely above the low-signal threshold while proving that table structure is flattened only in the speech-oriented step.
`);

  assert.ok(narration.includes("Mean Rank"));
  assert.ok(narration.includes("34.30"));
  assert.ok(narration.includes("Automated evals"));
  assert.ok(narration.includes("Faster iteration"));
  assert.ok(narration.includes("Up-front investment"));
  assert.ok(!narration.includes("<table"));
  assert.ok(!narration.includes("| ---"));
});

test("markdownToNarrationText preserves inline link labels and normalizes escaped markdown artifacts", () => {
  const narration = markdownToNarrationText(`
Ever since it showed up on my GH feed, Karpathy's [Autoresearch](https://example.com/autoresearch) was rattling around in the back of my mind.

I added a \\[scratchpad\\] file for the agent to use as working memory. This work probably existed before. ↩

Jeff Teper \\- who discovered me in a broken state after OneDrive — helped me reset how I think about product work.

\\# LLM Wiki

\\*\\*Personal\\*\\* notes matter when they keep future summaries grounded.
`);

  assert.ok(narration.includes("Karpathy's Autoresearch was rattling around in the back of my mind."));
  assert.ok(narration.includes("I added a [scratchpad] file for the agent to use as working memory."));
  assert.ok(narration.includes("Jeff Teper - who discovered me in a broken state after OneDrive"));
  assert.ok(narration.includes("LLM Wiki"));
  assert.ok(narration.includes("Personal notes matter when they keep future summaries grounded."));
  assert.ok(!narration.includes("https://"));
  assert.ok(!narration.includes("↩"));
  assert.ok(!narration.includes("\\#"));
  assert.ok(!narration.includes("\\*"));
});

test("summaryMarkdownToNarrationText removes trailing sources appendix while keeping the summary body", () => {
  const narration = summaryMarkdownToNarrationText(`
# Weekly AI Brief

This roundup keeps the polished summary body available for reuse while the narration path removes the citation appendix before audio generation and episode-description derivation.

## Notable developments

- Model routing is getting cheaper.

## Sources

- [Research note](https://example.com/research-note)
- https://cdn.example.com/chart.png
`);

  assert.ok(narration.includes("Weekly AI Brief"));
  assert.ok(narration.includes("Model routing is getting cheaper."));
  assert.ok(!narration.includes("Sources"));
  assert.ok(!narration.includes("research-note"));
  assert.ok(!narration.includes("cdn.example.com"));
});

test("markdownToNarrationText strips trailing host-only source suffixes from link lines", () => {
  const narration = markdownToNarrationText(`
[Project Glasswing: Securing critical software for the AI era](https://www.anthropic.com/glasswing) ([anthropic.com](https://news.ycombinator.com/from?site=anthropic.com))

[Xilem - An experimental Rust native UI framework](https://github.com/linebender/xilem) ([github.com/linebender](https://news.ycombinator.com/from?site=github.com/linebender))

The follow-up paragraph keeps the sample narratable and confirms the host-only suffix should not be spoken aloud.
`);

  assert.ok(narration.includes("Project Glasswing: Securing critical software for the AI era"));
  assert.ok(narration.includes("Xilem - An experimental Rust native UI framework"));
  assert.ok(narration.includes("The follow-up paragraph keeps the sample narratable"));
  assert.ok(!narration.includes("anthropic.com"));
  assert.ok(!narration.includes("github.com/linebender"));
});

test("footer-only junk stays non-narratable after cleanup", () => {
  const cleaned = cleanExtractedMarkdown(`
[© 2026 Meta](https://www.facebook.com/)

[About](https://www.meta.com/about/)[Developers](https://developers.meta.com/)[Careers](https://www.metacareers.com/)[Privacy](https://www.facebook.com/privacy/)[Cookies](https://www.facebook.com/help/cookies)[Terms](https://www.facebook.com/policies/)[Help Center](https://www.facebook.com/help/)

[English (US)](https://business.facebook.com/)[English (UK)](https://business.facebook.com/)[Español](https://business.facebook.com/)[More languages](#)
`);

  const narration = markdownToNarrationText(cleaned);
  assert.equal(cleaned, "");
  assert.equal(hasNarratableText(narration), false);
});
