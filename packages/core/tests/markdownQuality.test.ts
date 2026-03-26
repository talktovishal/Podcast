import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMarkdownQuality } from "../src/extract/markdownCleanup";

test("analyzeMarkdownQuality reports Substack-style image/share cleanup issues before cleanup", () => {
  const analysis = analyzeMarkdownQuality(`
[ ![](https://substackcdn.com/image/fetch/hero.jpeg) ](https://substackcdn.com/image/fetch/hero.jpeg)

_December 5th, 2025. (Photo by Jonathan Hoefler)_

The photo above shows the entrance to Unity Temple and introduces the main article body with enough prose for narration.

[Share](https://example.com/share)
`);

  assert.equal(analysis.issueCounts.image_wrapper, 1);
  assert.equal(analysis.issueCounts.residual_url, 1);
  assert.equal(analysis.issueCounts.share_or_comment_noise, 1);
  assert.ok(analysis.cleanedMarkdown.includes("The photo above shows the entrance to Unity Temple"));
  assert.ok(!analysis.cleanedMarkdown.includes("Share"));
});

test("analyzeMarkdownQuality reports Meta-style footer/legal and low-signal cleanup issues", () => {
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

test("analyzeMarkdownQuality reports BBC-style leading metadata and residual URL/image issues", () => {
  const analysis = analyzeMarkdownQuality(`
9 hours ago

Grace Eliza Goodwin

![](https://static.files.bbci.co.uk/grey-placeholder.png)![Getty Images large gold bars inside a wooden case](https://ichef.bbci.co.uk/news/example.jpg.webp)Getty Images

Gold bars taken from the SS Central America ship are displayed at the Museum of American Financial History in 2003 in New York City

A US deep-sea treasure hunter who refused to disclose the location of a famed shipwreck's gold coins has been released from prison after a decade, with 500 coins still unaccounted for.

Tommy Thompson, 73, discovered millions of dollars' worth of sunken treasure from the 1857 wreck of the SS Central America, also known as the Ship of Gold, off the coast of South Carolina in 1988.
`);

  assert.equal(analysis.issueCounts.leading_metadata, 1);
  assert.equal(analysis.issueCounts.image_wrapper, 1);
  assert.equal(analysis.issueCounts.residual_url, 1);
  assert.ok(analysis.cleanedMarkdown.startsWith("A US deep-sea treasure hunter"));
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

test("analyzeMarkdownQuality reports Business Insider-style metadata and subscriber chrome before cleanup", () => {
  const analysis = analyzeMarkdownQuality(`
2026-02-19T11:47:08.112Z

Feb 19, 2026, 3:47 AM PT

Nostalgia is everywhere on the internet right now.

With doomsayers predicting that AI could bring about the apocalypse, this January marking the highest number of layoffs to kick off a year since 2009, and ongoing political unrest, people are harking back to simpler times.

4 MIN READ

- Tech
- AI
- gen z
- More
- Society

## Read next

This story is available exclusively to Business Insider subscribers. Become an Insider and start reading now. Have an account? .
`);

  assert.equal(analysis.issueCounts.leading_metadata, 1);
  assert.equal(analysis.issueCounts.footer_legal, 0);
  assert.ok(analysis.cleanedMarkdown.includes("Nostalgia is everywhere on the internet right now."));
  assert.ok(!analysis.cleanedMarkdown.includes("4 MIN READ"));
  assert.ok(!analysis.cleanedMarkdown.includes("Become an Insider"));
  assert.ok(!analysis.cleanedMarkdown.includes("- Tech"));
});
