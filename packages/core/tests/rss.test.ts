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
    imageUrl: "http://localhost:3000/brand/podcast-cover-1400.png?x=1&y=2",
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
  assert.ok(xml.includes('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"'));
  assert.ok(
    xml.includes('<itunes:image href="http://localhost:3000/brand/podcast-cover-1400.png?x=1&amp;y=2" />'),
    "missing escaped itunes:image href"
  );
  assert.ok(
    xml.includes("<image>\n      <url>http://localhost:3000/brand/podcast-cover-1400.png?x=1&amp;y=2</url>"),
    "missing channel image url"
  );
  assert.ok(xml.includes("<image>"));
  assert.ok(xml.includes("<link>http://localhost:3000</link>"));
  assert.ok(xml.includes("<atom:link "));
  assert.ok(xml.includes("<pubDate>Thu, 02 Jan 2025 00:00:00 GMT</pubDate>"));
  assert.ok(xml.includes("<lastBuildDate>Thu, 02 Jan 2025 00:00:00 GMT</lastBuildDate>"));
  assert.ok(/<guid isPermaLink="false">a<\/guid>/.test(xml));
  assert.ok(/<enclosure url="http:\/\/localhost\/media\/1\.m4a" length="111" type="audio\/mp4" \/>/.test(xml));
  assert.ok(/<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/.test(xml));
});

test("buildRssXml omits image blocks when imageUrl is undefined", () => {
  const xml = buildRssXml({
    title: "Feed",
    description: "Desc",
    link: "http://localhost:3000",
    feedUrl: "http://localhost:3000/rss/token.xml",
    language: "en-us",
    episodes: [
      {
        guid: "a",
        title: "One",
        description: "One",
        pubDate: new Date("2025-01-02T00:00:00Z"),
        enclosureUrl: "http://localhost/media/1.m4a",
        enclosureLength: 111,
        enclosureType: "audio/mp4"
      }
    ]
  });

  assert.equal(xml.includes("<itunes:image "), false);
  assert.equal(xml.includes("<image>"), false);
});

test("buildRssXml rejects duplicate GUIDs", () => {
  assert.throws(() =>
    buildRssXml({
      title: "Feed",
      description: "Desc",
      link: "http://localhost:3000",
      feedUrl: "http://localhost:3000/rss/token.xml",
      language: "en-us",
      episodes: [
        {
          guid: "same",
          title: "One",
          description: "One",
          pubDate: new Date("2025-01-02T00:00:00Z"),
          enclosureUrl: "http://localhost/media/1.m4a",
          enclosureLength: 111,
          enclosureType: "audio/mp4"
        },
        {
          guid: "same",
          title: "Two",
          description: "Two",
          pubDate: new Date("2025-01-01T00:00:00Z"),
          enclosureUrl: "http://localhost/media/2.m4a",
          enclosureLength: 222,
          enclosureType: "audio/mp4"
        }
      ]
    })
  );
});

test("buildRssXml rejects duplicate enclosure URLs", () => {
  assert.throws(() =>
    buildRssXml({
      title: "Feed",
      description: "Desc",
      link: "http://localhost:3000",
      feedUrl: "http://localhost:3000/rss/token.xml",
      language: "en-us",
      episodes: [
        {
          guid: "a",
          title: "One",
          description: "One",
          pubDate: new Date("2025-01-02T00:00:00Z"),
          enclosureUrl: "http://localhost/media/same.m4a",
          enclosureLength: 111,
          enclosureType: "audio/mp4"
        },
        {
          guid: "b",
          title: "Two",
          description: "Two",
          pubDate: new Date("2025-01-01T00:00:00Z"),
          enclosureUrl: "http://localhost/media/same.m4a",
          enclosureLength: 222,
          enclosureType: "audio/mp4"
        }
      ]
    })
  );
});
