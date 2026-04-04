import assert from "node:assert/strict";
import test from "node:test";
import { cleanExtractedMarkdown, hasNarratableText, markdownToNarrationText } from "../src/extract/markdownCleanup";

test("cleanExtractedMarkdown removes LinkedIn-style author chrome and comment links", () => {
  const cleaned = cleanExtractedMarkdown(`
## John Gargiulo's Post

[](https://www.linkedin.com/in/john-gargiulo)

7h

A week ago I didn't know what a pull request was. This week, I've submitted twelve of them.

[See more comments](https://www.linkedin.com/signup)

## Explore content categories
`);

  assert.ok(cleaned.startsWith("A week ago I didn't know what a pull request was."));
  assert.ok(!cleaned.includes("John Gargiulo's Post"));
  assert.ok(!cleaned.includes("See more comments"));
  assert.ok(!cleaned.includes("linkedin.com"));
});

test("cleanExtractedMarkdown strips Substack image wrappers and share prompts", () => {
  const cleaned = cleanExtractedMarkdown(`
[

![](https://substackcdn.com/image/fetch/hero.jpeg)

](https://substackcdn.com/image/fetch/hero.jpeg)

_December 5th, 2025. (Photo by Jonathan Hoefler)_

The photo above shows the entrance to Unity Temple.

[Share](https://example.com/share)

My hope was to answer those questions by creating a comprehensive visual timeline.
`);

  assert.ok(cleaned.includes("The photo above shows the entrance to Unity Temple."));
  assert.ok(cleaned.includes("My hope was to answer those questions by creating a comprehensive visual timeline."));
  assert.ok(!cleaned.includes("substackcdn.com"));
  assert.ok(!cleaned.includes("Share"));
  assert.ok(!cleaned.includes("Photo by Jonathan Hoefler"));
});

test("cleanExtractedMarkdown removes India Today metadata and footer blocks", () => {
  const cleaned = cleanExtractedMarkdown(`
## India head coach Gautam Gambhir faced criticism after Washington Sundar's underwhelming performance against South Africa.

![Washington Sundar (AP Photo)](https://example.com/sundar.jpg)

T20 World Cup, IND vs SA: Washington Sundar scored 11 runs and bowled 2 overs(AP Photo)

[![India Today Sports Desk](https://example.com/author.jpg)](https://www.indiatoday.in/author)

New Delhi,UPDATED: Feb 22, 2026 23:59 IST

India head coach Gautam Gambhir has been slammed by fans following Washington Sundar's poor showing.

**[T20 World Cup](https://example.com/world-cup) | [T20 World Cup Schedule](https://example.com/schedule) | [Live Score](https://example.com/live)**

- Ends

Published By:

Rishabh Beniwal

Published On:

Feb 22, 2026

Must Watch
`);

  assert.ok(cleaned.startsWith("## India head coach Gautam Gambhir faced criticism"));
  assert.ok(cleaned.includes("India head coach Gautam Gambhir has been slammed by fans"));
  assert.ok(!cleaned.includes("AP Photo"));
  assert.ok(!cleaned.includes("India Today Sports Desk"));
  assert.ok(!cleaned.includes("Published By"));
  assert.ok(!cleaned.includes("Must Watch"));
  assert.ok(!cleaned.includes("Live Score"));
});

test("cleanExtractedMarkdown removes caption-credit noise from NPR-style markdown", () => {
  const cleaned = cleanExtractedMarkdown(`
![Government supporters chant slogans as they gather in mourning.](https://example.com/image.jpg)

Government supporters chant slogans as they gather in mourning. Vahid Salemi/AP hide caption

toggle caption

Vahid Salemi/AP

DUBAI, United Arab Emirates — Iran fired missiles at targets in Israel and Gulf Arab states Sunday.
`);

  assert.equal(
    cleaned,
    "DUBAI, United Arab Emirates — Iran fired missiles at targets in Israel and Gulf Arab states Sunday."
  );
});

test("cleanExtractedMarkdown removes BBC-style leading metadata and image-credit caption blocks", () => {
  const cleaned = cleanExtractedMarkdown(`
9 hours ago

Grace Eliza Goodwin

![](https://static.files.bbci.co.uk/grey-placeholder.png)![Getty Images large gold bars inside a wooden case](https://ichef.bbci.co.uk/news/example.jpg.webp)Getty Images

Gold bars taken from the SS Central America ship are displayed at the Museum of American Financial History in 2003 in New York City

A US deep-sea treasure hunter who refused to disclose the location of a famed shipwreck's gold coins has been released from prison after a decade, with 500 coins still unaccounted for.

Tommy Thompson, 73, discovered millions of dollars' worth of sunken treasure from the 1857 wreck of the SS Central America, also known as the Ship of Gold, off the coast of South Carolina in 1988.
`);

  assert.ok(cleaned.startsWith("A US deep-sea treasure hunter who refused to disclose"));
  assert.ok(!cleaned.includes("9 hours ago"));
  assert.ok(!cleaned.includes("Grace Eliza Goodwin"));
  assert.ok(!cleaned.includes("Getty Images"));
  assert.ok(!cleaned.includes("Gold bars taken from the SS Central America ship"));
  assert.ok(!cleaned.includes("https://"));
});

test("cleanExtractedMarkdown removes standalone raw image asset url fragments from source markdown", () => {
  const cleaned = cleanExtractedMarkdown(`
March 20, 2026

/https://tf-cmsv2-smithsonianmag-media.s3.amazonaws.com/accounts/headshot/Ramsha_Zubairi-edit.png)

:focal(512x336:513x337)/https://tf-cmsv2-smithsonianmag-media.s3.amazonaws.com/filer_public/25/cb/25cb708a-97b2-463b-b3f6-c208632d7dbc/gettyimages-645604187.jpg)

Ramsha Zubairi is a historian of science who studies observatories and archives.

The article opens by explaining how eclipse data changed the way researchers compared sky surveys across decades.
`);

  assert.ok(cleaned.startsWith("Ramsha Zubairi is a historian of science"));
  assert.ok(cleaned.includes("The article opens by explaining how eclipse data changed"));
  assert.ok(!cleaned.includes("March 20, 2026"));
  assert.ok(!cleaned.includes("smithsonianmag-media"));
  assert.ok(!cleaned.includes(".png"));
  assert.ok(!cleaned.includes(".jpg"));
  assert.ok(!cleaned.includes(":focal("));
});

test("cleanExtractedMarkdown removes Fast Company promo and legal footer paragraphs", () => {
  const cleaned = cleanExtractedMarkdown(`
Last fall, Chives took over Reddit.

It started when a cook pledged to practice his chive-cutting skills every day.

Explore the full 2026 list of Fast Company's Most Innovative Companies.

The final deadline for Fast Company's Best Workplaces for Innovators is this Friday. Apply today.
`);

  assert.ok(cleaned.includes("Last fall, Chives took over Reddit."));
  assert.ok(cleaned.includes("It started when a cook pledged"));
  assert.ok(!cleaned.includes("Most Innovative Companies"));
  assert.ok(!cleaned.includes("Apply today"));
});

test("cleanExtractedMarkdown removes Business Insider timestamps subscriber chrome and trailing tag lists", () => {
  const cleaned = cleanExtractedMarkdown(`
2026-02-19T11:47:08.112Z

Feb 19, 2026, 3:47 AM PT

Nostalgia is everywhere on the internet right now.

With doomsayers predicting that AI could bring about the apocalypse, this January marking the highest number of layoffs to kick off a year since 2009, and ongoing political unrest, people are harking back to simpler times.

4 MIN READ

## Going analog

As part of the push to get offline, many Gen Z and millennials are rejecting new technology by Bricking their phones and leaning into in-person hobbies.

- Tech
- AI
- gen z
- More
- Society

## Read next

This story is available exclusively to Business Insider subscribers. Become an Insider and start reading now. Have an account? .
`);

  assert.ok(cleaned.includes("Nostalgia is everywhere on the internet right now."));
  assert.ok(cleaned.includes("As part of the push to get offline"));
  assert.ok(!cleaned.includes("2026-02-19T11:47:08.112Z"));
  assert.ok(!cleaned.includes("Feb 19, 2026, 3:47 AM PT"));
  assert.ok(!cleaned.includes("4 MIN READ"));
  assert.ok(!cleaned.includes("This story is available exclusively to Business Insider subscribers"));
  assert.ok(!cleaned.includes("Become an Insider"));
  assert.ok(!cleaned.includes("- Tech"));
  assert.ok(!cleaned.includes("## Read next"));
});

test("cleanExtractedMarkdown removes Verge-style standfirst byline date and author bio chrome", () => {
  const cleaned = cleanExtractedMarkdown(`
Skip to main content

Smart lights that know where they’re placed in a room, wild designs for next-gen routers, and a glowing inedible donut.

by Andrew Liszewski

Updated Jan 9, 2026, 5:53 AM PST

Image: Corsair

Andrew Liszewski is a senior reporter who’s been covering and reviewing the latest gadgets and tech since 2006, but has loved all things electronic since he was a kid.

The CES show floor officially closes its doors at the end of the day, but there’s still a trickle of announcements and reveals coming out of Las Vegas.

As the show draws to a close for another year, you can still catch up on all of The Verge’s CES 2026 coverage here.
`);

  assert.ok(cleaned.startsWith("The CES show floor officially closes its doors"));
  assert.ok(cleaned.includes("As the show draws to a close for another year"));
  assert.ok(!cleaned.includes("Skip to main content"));
  assert.ok(!cleaned.includes("glowing inedible donut"));
  assert.ok(!cleaned.includes("by Andrew Liszewski"));
  assert.ok(!cleaned.includes("Updated Jan 9, 2026"));
  assert.ok(!cleaned.includes("Image: Corsair"));
  assert.ok(!cleaned.includes("is a senior reporter"));
});

test("cleanExtractedMarkdown rejects Meta footer-only junk as non-narratable", () => {
  const cleaned = cleanExtractedMarkdown(`
[© 2026 Meta](https://www.facebook.com/)

[About](https://www.meta.com/about/)[Developers](https://developers.meta.com/)[Careers](https://www.metacareers.com/)[Privacy](https://www.facebook.com/privacy/)[Cookies](https://www.facebook.com/help/cookies)[Terms](https://www.facebook.com/policies/)[Help Center](https://www.facebook.com/help/)

[English (US)](https://business.facebook.com/)[English (UK)](https://business.facebook.com/)[Español](https://business.facebook.com/)[More languages](#)
`);

  const narration = markdownToNarrationText(cleaned);
  assert.equal(cleaned, "");
  assert.equal(hasNarratableText(narration), false);
});

test("cleanExtractedMarkdown removes Claude marketing nav and cookie footer while preserving core body", () => {
  const cleaned = cleanExtractedMarkdown(`
[](https://claude.com/)

- Meet Claude
- Solutions
- Resources
- [Login](https://claude.ai/login)

## Thank you for everything you ship. Claude Max is on us.

Open-source maintainers and contributors keep the ecosystem running.

Write

- Help me develop a unique voice for an audience

### Cookie settings

We use cookies to deliver and improve our services, analyze site usage, and if you agree, to customize or personalize your experience and market our services to you. You can read our Cookie Policy here.

English (US)
`);

  assert.ok(cleaned.includes("## Thank you for everything you ship. Claude Max is on us."));
  assert.ok(cleaned.includes("Open-source maintainers and contributors keep the ecosystem running."));
  assert.ok(!cleaned.includes("Meet Claude"));
  assert.ok(!cleaned.includes("Cookie settings"));
  assert.ok(!cleaned.includes("English (US)"));
});

test("cleanExtractedMarkdown flattens legacy raw HTML tables and strips tag remnants", () => {
  const cleaned = cleanExtractedMarkdown(`
The harness comparison below was captured from an older stored markdown artifact.

<table><tbody><tr><th><strong>Harness</strong></th><th><strong>Duration</strong></th><th><strong>Cost</strong></th></tr><tr><td>Solo</td><td>20 min</td><td>$9</td></tr><tr><td>Full harness</td><td>6 hr</td><td>$200</td></tr></tbody></table>

Agent &amp; Phase summary stays useful for narration after cleanup.
`);

  assert.ok(cleaned.includes("The harness comparison below was captured"));
  assert.ok(cleaned.includes("Harness"));
  assert.ok(cleaned.includes("Duration"));
  assert.ok(cleaned.includes("Full harness"));
  assert.ok(cleaned.includes("Agent & Phase summary stays useful for narration after cleanup."));
  assert.ok(!cleaned.includes("<table"));
  assert.ok(!cleaned.includes("<th"));
  assert.ok(!cleaned.includes("&amp;"));
});

test("markdownToNarrationText preserves inline link text and normalizes escaped markdown artifacts", () => {
  const cleaned = cleanExtractedMarkdown(`
Ever since it showed up on my GH feed, Karpathy's [Autoresearch](https://example.com/autoresearch) was rattling around in the back of my mind.

I added a \\[scratchpad\\] file for the agent to use as working memory. This work probably existed before. ↩
`);

  const narration = markdownToNarrationText(cleaned);
  assert.ok(narration.includes("Karpathy's Autoresearch was rattling around in the back of my mind."));
  assert.ok(narration.includes("I added a [scratchpad] file for the agent to use as working memory."));
  assert.ok(!narration.includes("https://"));
  assert.ok(!narration.includes("↩"));
});

test("markdownToNarrationText does not narrate standalone image asset urls", () => {
  const narration = markdownToNarrationText(`
The profile image line below leaked out of a stored markdown artifact.

/https://cdn.example.com/authors/portrait.webp)

:focal(512x336:513x337)/https://cdn.example.com/photos/hero.jpg)

The body text should remain available for narration without speaking the asset path.
`);

  assert.ok(narration.includes("The body text should remain available for narration"));
  assert.ok(!narration.includes("cdn.example.com"));
  assert.ok(!narration.includes("portrait.webp"));
  assert.ok(!narration.includes("hero.jpg"));
  assert.ok(!narration.includes(":focal("));
});

test("markdownToNarrationText strips raw HTML tags and markdown table separator remnants", () => {
  const narration = markdownToNarrationText(`
The final test scores are below.

<table><thead><tr><th>Mean Rank</th><th>img->txt R@5</th></tr></thead><tbody><tr><td><strong>34.30</strong></td><td><strong>53.0%</strong></td></tr></tbody></table>

| Method | Pros | Cons |
| --- | --- | --- |
| Automated evals | Faster iteration | Up-front investment |
`);

  assert.ok(narration.includes("Mean Rank"));
  assert.ok(narration.includes("34.30"));
  assert.ok(narration.includes("Automated evals"));
  assert.ok(!narration.includes("<table"));
  assert.ok(!narration.includes("thead"));
  assert.ok(!narration.includes("| ---"));
});
