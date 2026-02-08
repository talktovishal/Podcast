import test from "node:test";
import assert from "node:assert/strict";
import { buildRssXml } from "../src/rss/buildFeed";

test("buildRssXml keeps deterministic ordering and escapes XML", () => {
  const xml = buildRssXml({
    title: "Feed & Test",
    description: "Desc",
    link: "http://localhost:3000",
    feedUrl: "http://localhost:3000/rss/token.xml",
    language: "en-us",
    episodes: [
      {
        guid: "b",
        title: "Two",
        description: "Hello <world>",
        pubDate: new Date("2025-01-01T00:00:00Z"),
        enclosureUrl: "http://localhost/media/2.m4a",
        enclosureLength: 222,
        enclosureType: "audio/mp4"
      },
      {
        guid: "a",
        title: "One",
        description: "Hi",
        pubDate: new Date("2025-01-02T00:00:00Z"),
        enclosureUrl: "http://localhost/media/1.m4a",
        enclosureLength: 111,
        enclosureType: "audio/mp4"
      }
    ]
  });

  assert.ok(xml.indexOf("One") < xml.indexOf("Two"));
  assert.ok(xml.includes("Feed &amp; Test"));
  assert.ok(xml.includes("Hello &lt;world&gt;"));
});
