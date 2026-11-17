import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTranscriptCandidate,
  normalizePodcastTranscript,
  resolvePodcastTranscript
} from "../src/transcripts/podcastTranscript";

const LONG_TRANSCRIPT_TEXT = [
  "Speaker: This public transcript contains enough useful detail for ArticlePod to summarize.",
  "The guest explains the main idea, adds a concrete example, and connects it to a broader lesson.",
  "The host asks a follow up question, and the answer includes practical implications for listeners.",
  "The conversation keeps going with specific evidence, careful caveats, and a memorable closing reflection."
].join(" ");

const validateUrl = async (rawUrl: string) => ({
  url: new URL(rawUrl),
  resolvedIp: "203.0.113.10",
  resolvedIps: ["203.0.113.10"]
});

function response(body: string, headers?: Record<string, string>): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": headers?.["content-type"] ?? "text/plain; charset=utf-8",
      "content-length": String(Buffer.byteLength(body, "utf8")),
      ...headers
    }
  });
}

test("classifyTranscriptCandidate detects Apple episode and show URLs", () => {
  assert.deepEqual(
    classifyTranscriptCandidate({
      url: "https://podcasts.apple.com/us/podcast/example-show/id123456789?i=1000000001"
    }),
    {
      kind: "apple_podcast_episode",
      url: "https://podcasts.apple.com/us/podcast/example-show/id123456789?i=1000000001",
      showId: "123456789",
      episodeId: "1000000001"
    }
  );
  assert.equal(
    classifyTranscriptCandidate({
      url: "https://podcasts.apple.com/us/podcast/example-show/id123456789"
    }).kind,
    "apple_podcast_show"
  );
});

test("resolvePodcastTranscript resolves Apple episode RSS transcript by GUID", async () => {
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url;
    if (url.startsWith("https://itunes.apple.com/lookup")) {
      return response(
        JSON.stringify({
          results: [
            {
              wrapperType: "track",
              kind: "podcast",
              collectionId: 123456789,
              trackId: 123456789,
              collectionName: "Example Show",
              feedUrl: "https://example.com/feed.xml"
            },
            {
              wrapperType: "podcastEpisode",
              kind: "podcast-episode",
              collectionId: 123456789,
              trackId: 1000000001,
              collectionName: "Example Show",
              trackName: "Episode One",
              feedUrl: "https://example.com/feed.xml",
              episodeGuid: "episode-guid-1",
              releaseDate: "2026-05-01T00:00:00Z"
            }
          ]
        }),
        { "content-type": "application/json" }
      );
    }
    if (url === "https://example.com/feed.xml") {
      return response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0">
          <channel>
            <item>
              <title>Wrong Episode</title>
              <guid>wrong-guid</guid>
              <podcast:transcript url="https://example.com/wrong.txt" type="text/plain" />
            </item>
            <item>
              <title>Episode One</title>
              <guid>episode-guid-1</guid>
              <pubDate>Fri, 01 May 2026 00:00:00 GMT</pubDate>
              <podcast:transcript url="https://example.com/episode-one.vtt" type="text/vtt" />
            </item>
          </channel>
        </rss>`,
        { "content-type": "application/rss+xml" }
      );
    }
    if (url === "https://example.com/episode-one.vtt") {
      return response(`WEBVTT\n\n1\n00:00:00.000 --> 00:00:05.000\n${LONG_TRANSCRIPT_TEXT}`, {
        "content-type": "text/vtt"
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;

  const resolved = await resolvePodcastTranscript(
    {
      url: "https://podcasts.apple.com/us/podcast/example-show/id123456789?i=1000000001"
    },
    { fetchImpl, validateUrl }
  );

  assert.equal(resolved.title, "Episode One");
  assert.equal(resolved.transcriptFormat, "vtt");
  assert.equal(resolved.episodeGuid, "episode-guid-1");
  assert.match(resolved.markdown, /# Episode One/);
  assert.match(resolved.markdown, /practical implications/);
});

test("resolvePodcastTranscript fails Apple show URLs without an episode id", async () => {
  await assert.rejects(
    () =>
      resolvePodcastTranscript(
        { url: "https://podcasts.apple.com/us/podcast/example-show/id123456789" },
        { fetchImpl: fetch, validateUrl }
      ),
    (error: unknown) => error instanceof Error && "code" in error && (error as { code?: string }).code === "PODCAST_EPISODE_REQUIRED"
  );
});

test("resolvePodcastTranscript fails clearly when RSS item has no public transcript", async () => {
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url;
    if (url.startsWith("https://itunes.apple.com/lookup")) {
      return response(
        JSON.stringify({
          results: [
            { wrapperType: "track", kind: "podcast", feedUrl: "https://example.com/feed.xml" },
            {
              wrapperType: "podcastEpisode",
              trackId: 1000000001,
              trackName: "Episode One",
              feedUrl: "https://example.com/feed.xml",
              episodeGuid: "episode-guid-1"
            }
          ]
        }),
        { "content-type": "application/json" }
      );
    }
    return response(
      `<?xml version="1.0" encoding="UTF-8"?><rss><channel><item><title>Episode One</title><guid>episode-guid-1</guid></item></channel></rss>`,
      { "content-type": "application/rss+xml" }
    );
  }) as typeof fetch;

  await assert.rejects(
    () =>
      resolvePodcastTranscript(
        { url: "https://podcasts.apple.com/us/podcast/example-show/id123456789?i=1000000001" },
        { fetchImpl, validateUrl }
      ),
    (error: unknown) => error instanceof Error && "code" in error && (error as { code?: string }).code === "PODCAST_TRANSCRIPT_NOT_FOUND"
  );
});

test("normalizePodcastTranscript supports VTT, SRT, text, and HTML", () => {
  const vtt = normalizePodcastTranscript({
    raw: `WEBVTT\n\n00:00:00.000 --> 00:00:04.000\n${LONG_TRANSCRIPT_TEXT}`,
    format: "vtt",
    url: "https://example.com/transcript.vtt",
    title: "VTT"
  });
  const srt = normalizePodcastTranscript({
    raw: `1\n00:00:00,000 --> 00:00:04,000\n${LONG_TRANSCRIPT_TEXT}`,
    format: "srt",
    url: "https://example.com/transcript.srt",
    title: "SRT"
  });
  const text = normalizePodcastTranscript({
    raw: LONG_TRANSCRIPT_TEXT,
    format: "text",
    url: "https://example.com/transcript.txt",
    title: "Text"
  });
  const html = normalizePodcastTranscript({
    raw: `<html><body><article><h1>HTML</h1><p>${LONG_TRANSCRIPT_TEXT}</p></article></body></html>`,
    format: "html",
    url: "https://example.com/transcript.html",
    title: "HTML"
  });

  assert.match(vtt, /Speaker:/);
  assert.match(srt, /broader lesson/);
  assert.match(text, /closing reflection/);
  assert.match(html, /specific evidence/);
});

test("resolvePodcastTranscript rejects unsupported direct transcript formats", async () => {
  const fetchImpl = (async () =>
    response(JSON.stringify({ cues: [] }), {
      "content-type": "application/json"
    })) as typeof fetch;

  await assert.rejects(
    () =>
      resolvePodcastTranscript(
        { url: "https://example.com/transcript" },
        { fetchImpl, validateUrl }
      ),
    (error: unknown) => error instanceof Error && "code" in error && (error as { code?: string }).code === "PODCAST_TRANSCRIPT_UNSUPPORTED"
  );
});
