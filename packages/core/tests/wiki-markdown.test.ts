import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWikiPageAliasMap,
  extractMarkdownSummary,
  extractMarkdownTitle,
  extractWikiLinkTargets,
  parseSimpleFrontmatter,
  resolveWikiTargetToPagePath,
  rewriteWikiLinksForApp,
  wikiPagePathToRoutePath,
  wikiPagePathToSlug,
  wikiSlugToPagePath
} from "../src/wiki/markdown";

test("simple frontmatter parsing keeps body intact", () => {
  const input = `---\ntitle: Example\ntags: [alpha, beta]\n---\n# Heading\n\nBody`;
  const parsed = parseSimpleFrontmatter(input);

  assert.equal(parsed.data.title, "Example");
  assert.deepEqual(parsed.data.tags, ["alpha", "beta"]);
  assert.equal(parsed.body, "# Heading\n\nBody");
});

test("markdown title and summary fall back sensibly", () => {
  assert.equal(extractMarkdownTitle("# Hello\n\nWorld", "concepts/test.md"), "Hello");
  assert.equal(extractMarkdownTitle("No heading", "concepts/my-page.md"), "My Page");
  assert.equal(extractMarkdownSummary("# Heading\n\nFirst paragraph.\n\n- bullet"), "First paragraph.");
});

test("wiki path helpers map between routes and paths", () => {
  assert.equal(wikiSlugToPagePath(undefined), "index.md");
  assert.deepEqual(wikiPagePathToSlug("concepts/topic.md"), ["concepts", "topic"]);
  assert.equal(wikiPagePathToRoutePath("index.md"), "/app/wiki");
  assert.equal(wikiPagePathToRoutePath("concepts/topic.md"), "/app/wiki/concepts/topic");
});

test("wiki target resolution supports direct and relative matches", () => {
  const pages = ["index.md", "concepts/topic.md", "sources/items/item-1.md"];
  const aliases = buildWikiPageAliasMap(pages);

  assert.equal(aliases.get("topic"), "concepts/topic.md");
  assert.equal(
    resolveWikiTargetToPagePath({
      target: "topic",
      currentPagePath: "index.md",
      pagePaths: pages
    }),
    "concepts/topic.md"
  );
  assert.equal(
    resolveWikiTargetToPagePath({
      target: "../concepts/topic.md",
      currentPagePath: "sources/items/item-1.md",
      pagePaths: pages
    }),
    "concepts/topic.md"
  );
});

test("wiki link extraction and rewrite handle wikilinks and markdown links", () => {
  const markdown = "See [[concepts/topic|Topic]] and [Item](sources/items/item-1.md).";
  const pages = ["concepts/topic.md", "sources/items/item-1.md"];

  assert.deepEqual(extractWikiLinkTargets(markdown), ["concepts/topic", "sources/items/item-1.md"]);
  assert.equal(
    rewriteWikiLinksForApp(markdown, {
      currentPagePath: "index.md",
      pagePaths: pages
    }),
    "See [Topic](/app/wiki/concepts/topic) and [Item](/app/wiki/sources/items/item-1)."
  );
});
