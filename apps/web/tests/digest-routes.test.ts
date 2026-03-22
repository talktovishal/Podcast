import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { POST as rotateDigestFeedTokenPost } from "../src/app/api/digest-feed-token/rotate/route";
import { GET as digestRunsGet } from "../src/app/api/digest/runs/route";
import { GET as digestSettingsGet, POST as digestSettingsPost } from "../src/app/api/digest/settings/route";
import { POST as digestTickPost } from "../src/app/api/internal/digests/tick/route";
import { GET as digestMediaGet, HEAD as digestMediaHead } from "../src/app/api/digest-media/[...path]/route";
import { GET as digestRssGet } from "../src/app/rss/digest/[token]/route";
import { createSession, ensureUserDigestFeedToken } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";
import { getArtifactStorage } from "../src/lib/storage";

let dbReady = false;

function ensureDbBootstrap(): void {
  if (dbReady || process.env.ARTICLEPOD_TEST_DB_READY === "1") {
    dbReady = true;
    return;
  }

  const here = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = resolve(here, "../../..");
  const result = spawnSync("npx", ["pnpm", "--filter", "@articlepod/web", "run", "db:bootstrap"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "db bootstrap failed");
  }

  dbReady = true;
}

test("digest settings route requires auth", async () => {
  const response = await digestSettingsGet(new NextRequest("http://localhost/api/digest/settings"));
  assert.equal(response.status, 401);
});

test("digest settings POST persists and digest runs endpoint returns history", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: `digest-settings-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const session = await createSession(user.id);

    const saveRequest = new NextRequest("http://localhost/api/digest/settings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `articlepod_session=${session}`
      },
      body: JSON.stringify({
        timezone: "America/New_York",
        dailyEmailEnabled: true,
        dailyPodcastEnabled: false,
        dailyHour: 16,
        dailyMinute: 0,
        dailyLengthMinutes: 5,
        weeklyEmailEnabled: true,
        weeklyPodcastEnabled: true,
        weeklyDayOfWeek: 5,
        weeklyHour: 16,
        weeklyMinute: 0,
        weeklyLengthMinutes: 15
      })
    });
    const saveResponse = await digestSettingsPost(saveRequest);
    assert.equal(saveResponse.status, 200);

    await prisma.digestRun.create({
      data: {
        userId: user.id,
        cadence: "DAILY",
        periodKey: "2026-02-27",
        windowStart: new Date("2026-02-26T16:00:00.000Z"),
        windowEnd: new Date("2026-02-27T16:00:00.000Z"),
        scheduledFor: new Date("2026-02-27T16:00:00.000Z"),
        status: "SKIPPED",
        targetLengthMinutes: 5,
        sourceItemCount: 0,
        emailEnabled: true,
        emailStatus: "SKIPPED",
        podcastEnabled: false
      }
    });

    const runsRequest = new NextRequest("http://localhost/api/digest/runs?limit=10", {
      headers: {
        cookie: `articlepod_session=${session}`
      }
    });
    const runsResponse = await digestRunsGet(runsRequest);
    assert.equal(runsResponse.status, 200);
    const runsPayload = (await runsResponse.json()) as { ok: boolean; runs: Array<{ periodKey: string }> };
    assert.equal(runsPayload.ok, true);
    assert.equal(runsPayload.runs.some((run) => run.periodKey === "2026-02-27"), true);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("digest feed token rotate route rotates active token", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: `digest-token-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const session = await createSession(user.id);
    const oldToken = await ensureUserDigestFeedToken(user.id);

    const request = new NextRequest("http://localhost/api/digest-feed-token/rotate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `articlepod_session=${session}`
      },
      body: JSON.stringify({})
    });
    const response = await rotateDigestFeedTokenPost(request);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { ok: boolean; feed_url: string };
    assert.equal(payload.ok, true);
    assert.equal(payload.feed_url.includes(oldToken), false);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("internal digest tick endpoint enforces bearer secret and stores tick", async () => {
  ensureDbBootstrap();
  const previous = process.env.DIGEST_SCHEDULER_SECRET;
  process.env.DIGEST_SCHEDULER_SECRET = "digest-test-secret";

  try {
    const unauthorized = await digestTickPost(
      new NextRequest("http://localhost/api/internal/digests/tick", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({})
      })
    );
    assert.equal(unauthorized.status, 401);

    const authorized = await digestTickPost(
      new NextRequest("http://localhost/api/internal/digests/tick", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer digest-test-secret"
        },
        body: JSON.stringify({ forceNow: true, requestedBy: "test-suite" })
      })
    );
    assert.equal(authorized.status, 200);
    const payload = (await authorized.json()) as { ok: boolean; force_now: boolean };
    assert.equal(payload.ok, true);
    assert.equal(payload.force_now, true);
  } finally {
    if (previous === undefined) {
      delete process.env.DIGEST_SCHEDULER_SECRET;
    } else {
      process.env.DIGEST_SCHEDULER_SECRET = previous;
    }
  }
});

test("digest rss and digest media routes return feed + range-compatible audio", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `digest-rss-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const token = await ensureUserDigestFeedToken(user.id);
    const audioKey = `digests/${user.id}/weekly/2026-02-27/episode.mp3`;
    await storage.putObject(audioKey, Buffer.from("0123456789abcdef", "utf8"), {
      contentType: "audio/mpeg"
    });

    const run = await prisma.digestRun.create({
      data: {
        userId: user.id,
        cadence: "WEEKLY",
        periodKey: "2026-02-27",
        windowStart: new Date("2026-02-20T16:00:00.000Z"),
        windowEnd: new Date("2026-02-27T16:00:00.000Z"),
        scheduledFor: new Date("2026-02-27T16:00:00.000Z"),
        status: "SUCCEEDED",
        targetLengthMinutes: 15,
        sourceItemCount: 3,
        summaryStorageKey: `digests/${user.id}/weekly/2026-02-27/summary.md`,
        summaryBytes: 1200,
        emailEnabled: true,
        emailStatus: "STUB_STORED",
        podcastEnabled: true,
        podcastStatus: "SUCCEEDED",
        completedAt: new Date("2026-02-27T16:05:00.000Z")
      }
    });

    const episode = await prisma.digestEpisode.create({
      data: {
        digestRunId: run.id,
        userId: user.id,
        guid: `digest-guid-${uniq}`,
        title: "Weekly Digest",
        description: "Digest description",
        audioPath: audioKey,
        audioBytes: 16,
        mimeType: "audio/mpeg",
        publishedAt: new Date("2026-02-27T16:05:00.000Z")
      }
    });

    const rssResponse = await digestRssGet(new NextRequest(`http://localhost/rss/digest/${token}.xml`), { params: { token } });
    assert.equal(rssResponse.status, 200);
    const xml = await rssResponse.text();
    assert.equal(xml.includes("Weekly Digest"), true);
    assert.equal(xml.includes("/api/digest-media/"), true);
    assert.equal(xml.includes("<itunes:image "), true);
    assert.equal(xml.includes("<image>"), true);
    assert.equal(xml.includes("/brand/podcast-cover-1400.png"), true);

    // Extract media URL from XML enclosure
    const enclosureMatch = /enclosure url="([^"]+)"/.exec(xml);
    assert.ok(enclosureMatch, "enclosure URL must be present in RSS XML");
    const enclosureUrl = enclosureMatch[1];
    const enclosurePath = new URL(enclosureUrl).pathname.replace("/api/digest-media/", "");
    const enclosureSearch = new URL(enclosureUrl).search;

    const headResponse = await digestMediaHead(
      new NextRequest(`http://localhost/api/digest-media/${enclosurePath}${enclosureSearch}`),
      { params: { path: enclosurePath.split("/") } }
    );
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("content-length"), "16");
    assert.equal(headResponse.headers.get("accept-ranges"), "bytes");

    const rangeResponse = await digestMediaGet(
      new NextRequest(
        `http://localhost/api/digest-media/${enclosurePath}${enclosureSearch}`,
        {
          headers: {
            range: "bytes=0-1"
          }
        }
      ),
      { params: { path: enclosurePath.split("/") } }
    );
    assert.equal(rangeResponse.status, 206);
    assert.equal(rangeResponse.headers.get("content-range"), "bytes 0-1/16");

    const suffixRangeResponse = await digestMediaGet(
      new NextRequest(
        `http://localhost/api/digest-media/${enclosurePath}${enclosureSearch}`,
        {
          headers: {
            range: "bytes=-4"
          }
        }
      ),
      { params: { path: enclosurePath.split("/") } }
    );
    assert.equal(suffixRangeResponse.status, 206);
    assert.equal(suffixRangeResponse.headers.get("content-range"), "bytes 12-15/16");
    assert.equal(Buffer.from(await suffixRangeResponse.arrayBuffer()).toString("utf8"), "cdef");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("digest rss merges manual summary episodes and digest media serves them with summary scope", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const storage = getArtifactStorage();

  const user = await prisma.user.create({
    data: {
      email: `summary-rss-${uniq}@articlepod.local`,
      role: "USER",
      ttsProvider: "kokoro",
      ttsVoice: "af_heart"
    }
  });

  try {
    const token = await ensureUserDigestFeedToken(user.id);
    const audioKey = `summaries/${user.id}/summary-run-${uniq}/episode.mp3`;
    await storage.putObject(audioKey, Buffer.from("abcdefghijklmnop", "utf8"), {
      contentType: "audio/mpeg"
    });

    const run = await prisma.summaryRun.create({
      data: {
        userId: user.id,
        requestedTitle: "Manual summary run",
        title: "Manual summary run",
        windowStart: new Date("2026-02-20T16:00:00.000Z"),
        windowEnd: new Date("2026-02-27T16:00:00.000Z"),
        status: "SUCCEEDED",
        targetLengthMinutes: 15,
        selectedItemCount: 2,
        podcastEnabled: true,
        podcastStatus: "SUCCEEDED",
        summaryStorageKey: `summaries/${user.id}/summary-run-${uniq}/summary.md`,
        summaryBytes: 400,
        completedAt: new Date("2026-02-27T16:05:00.000Z")
      }
    });

    await prisma.summaryEpisode.create({
      data: {
        summaryRunId: run.id,
        userId: user.id,
        guid: `summary-guid-${uniq}`,
        title: "Manual summary run",
        description: "Manual summary description",
        audioPath: audioKey,
        audioBytes: 16,
        mimeType: "audio/mpeg",
        publishedAt: new Date("2026-02-27T16:05:00.000Z")
      }
    });

    const rssResponse = await digestRssGet(new NextRequest(`http://localhost/rss/digest/${token}.xml`), { params: { token } });
    assert.equal(rssResponse.status, 200);
    const xml = await rssResponse.text();
    assert.equal(xml.includes("Manual summary run"), true);
    const enclosureMatch = /enclosure url="([^"]*seid=[^"]+)"/.exec(xml);
    assert.ok(enclosureMatch, "summary enclosure URL must include seid");
    const enclosureUrl = enclosureMatch[1];
    const enclosurePath = new URL(enclosureUrl).pathname.replace("/api/digest-media/", "");
    const enclosureSearch = new URL(enclosureUrl).search;

    const headResponse = await digestMediaHead(
      new NextRequest(`http://localhost/api/digest-media/${enclosurePath}${enclosureSearch}`),
      { params: { path: enclosurePath.split("/") } }
    );
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("content-length"), "16");

    const rangeResponse = await digestMediaGet(
      new NextRequest(`http://localhost/api/digest-media/${enclosurePath}${enclosureSearch}`, {
        headers: {
          range: "bytes=0-1"
        }
      }),
      { params: { path: enclosurePath.split("/") } }
    );
    assert.equal(rangeResponse.status, 206);
    assert.equal(rangeResponse.headers.get("content-range"), "bytes 0-1/16");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
