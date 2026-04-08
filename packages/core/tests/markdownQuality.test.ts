import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMarkdownQuality, analyzeSummaryMarkdownQuality } from "../src/extract/markdownCleanup";

test("analyzeMarkdownQuality flags broken wrapper junk and share chrome but allows rich stored markdown details", () => {
  const analysis = analyzeMarkdownQuality(`
[ ![](https://substackcdn.com/image/fetch/hero.jpeg) ](https://substackcdn.com/image/fetch/hero.jpeg)

_December 5th, 2025. (Photo by Jonathan Hoefler)_

The photo above shows the entrance to Unity Temple and introduces the main article body with enough prose for narration. A second sentence makes the sample long enough that low-signal detection should not trigger.

[Share](https://example.com/share)

My hope was to answer those questions by creating a comprehensive visual timeline that remains useful once the audio path strips the image and raw URL details.
`);

  assert.equal(analysis.issueCounts.image_wrapper, 0);
  assert.equal(analysis.issueCounts.share_or_comment_noise, 1);
  assert.equal(analysis.issueCounts.residual_url, 0);
  assert.equal(analysis.issueCounts.leading_metadata, 0);
  assert.ok(analysis.cleanedMarkdown.includes("https://substackcdn.com/image/fetch/hero.jpeg"));
  assert.ok(analysis.cleanedMarkdown.includes("December 5th, 2025"));
  assert.ok(!analysis.narrationText.includes("substackcdn.com"));
});

test("analyzeMarkdownQuality still flags footer and low-signal junk", () => {
  const analysis = analyzeMarkdownQuality(`
[© 2026 Meta](https://www.facebook.com/)

[About](https://www.meta.com/about/)[Developers](https://developers.meta.com/)[Careers](https://www.metacareers.com/)[Privacy](https://www.facebook.com/privacy/)[Cookies](https://www.facebook.com/help/cookies)[Terms](https://www.facebook.com/policies/)[Help Center](https://www.facebook.com/help/)

[English (US)](https://business.facebook.com/)[English (UK)](https://business.facebook.com/)[Español](https://business.facebook.com/)[More languages](#)
`);

  assert.equal(analysis.issueCounts.footer_legal, 1);
  assert.equal(analysis.issueCounts.language_footer, 1);
  assert.equal(analysis.issueCounts.low_signal_after_cleanup, 1);
  assert.equal(analysis.cleanedMarkdown, "");
  assert.equal(analysis.hasNarratableText, false);
});

test("analyzeMarkdownQuality does not treat leading metadata or raw urls in saved markdown as persistence failures when narration strips them", () => {
  const analysis = analyzeMarkdownQuality(`
By Jane Example

March 21, 2026

See the reference deck at https://example.com/reference-deck for the source appendix and supporting material.

The article body adds enough detail to prove that saved markdown can stay rich while narration removes the metadata and URL residue before TTS and episode descriptions are derived.
`);

  assert.equal(analysis.issueCounts.leading_metadata, 0);
  assert.equal(analysis.issueCounts.residual_url, 0);
  assert.ok(analysis.cleanedMarkdown.includes("By Jane Example"));
  assert.ok(analysis.cleanedMarkdown.includes("https://example.com/reference-deck"));
  assert.ok(!analysis.narrationText.includes("By Jane Example"));
  assert.ok(!analysis.narrationText.includes("https://example.com/reference-deck"));
});

test("analyzeMarkdownQuality does not flag normal article prose about privacy as footer legal noise", () => {
  const analysis = analyzeMarkdownQuality(`
WASHINGTON (AP) — Communities across the country have seen a backlash against data centers over fears about rising electricity prices and concerns about pollution and water consumption.

Voters need far more than voluntary assurances from Big Tech oligarchs as they confront the most profound technological revolution in world history, lawmakers said.

Changes from AI and robotics will impact the U.S. economy and American democracy as well as our privacy rights, our emotional well-being, and our environment.
`);

  assert.equal(analysis.issueCounts.footer_legal, 0);
  assert.equal(analysis.issueCounts.low_signal_after_cleanup, 0);
  assert.ok(analysis.cleanedMarkdown.includes("privacy rights"));
});

test("analyzeSummaryMarkdownQuality ignores stored source appendices while keeping narration cleanup strict", () => {
  const analysis = analyzeSummaryMarkdownQuality(`
# Weekly AI Brief

The summary body stays rich in storage, and this paragraph is long enough that narration should remain valid after the appendix is removed.

## Sources

- [Research note](https://example.com/research-note)
- https://cdn.example.com/chart.png
`);

  assert.equal(analysis.issueCounts.residual_url, 0);
  assert.equal(analysis.issueCounts.image_wrapper, 0);
  assert.ok(analysis.cleanedMarkdown.includes("https://example.com/research-note"));
  assert.ok(!analysis.narrationText.includes("research-note"));
  assert.ok(!analysis.narrationText.includes("cdn.example.com"));
});
