import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { DELETE as deleteEpisodeShare, POST as postEpisodeShare } from "../src/app/api/share/episode/[itemId]/route";
import { GET as shareCtaGet } from "../src/app/api/share/cta/route";
import { GET as shareMediaGet, HEAD as shareMediaHead } from "../src/app/api/share-media/[...path]/route";
import SharedEpisodePage, { generateMetadata } from "../src/app/share/episode/[shareId]/[sig]/page";
import { createSession, ensurePublicEpisodeShareLink, revokePublicEpisodeShareLink } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";
import { buildPublicEpisodeMediaUrl } from "../src/lib/share-links";
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

function parseShareUrl(url: string): { shareId: string; sig: string } {
  const parsed = new URL(url);
  const [, shareSegment, episodeSegment, shareId, sig] = parsed.pathname.split("/");
  assert.equal(shareSegment, "share");
  assert.equal(episodeSegment, "episode");
  assert.ok(shareId);
  assert.ok(sig);
  return { shareId, sig };
}

async function seedReadyItem(input: { uniq: string; userId: string; sourceType?: "URL" | "PDF" | "HTML_SNAPSHOT" }) {
  const sourceType = input.sourceType ?? "URL";
  const item = await prisma.item.create({
    data: {
      userId: input.userId,
      sourceType,
      sourceUrl: sourceType === "PDF" ? null : `https://example.com/shared/${input.uniq}`,
      status: "READY",
      title: `Shared item ${input.uniq}`
    }
  });
  const audioPath = `items/${item.id}/episode.mp3`;
  const payload = Buffer.from(`shared-audio-${input.uniq}`, "utf8");
  await getArtifactStorage().putObject(audioPath, payload, { contentType: "audio/mpeg" });
  const episode = await prisma.episode.create({
    data: {
      itemId: item.id,
      guid: `episode-${item.id}`,
      title: `Shared episode ${input.uniq}`,
      description: "Shared episode description",
      audioPath,
      audioBytes: payload.byteLength,
      mimeType: "audio/mpeg",
      publishedAt: new Date()
    }
  });

  return {
    item,
    episode,
    audioPath,
    payload
  };
}

async function cleanupUserTree(userId: string, audioPaths: string[]) {
  for (const path of audioPaths) {
    await getArtifactStorage().deleteObject(path).catch(() => undefined);
  }
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

test("public episode share helper stays stable until revoke", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: `share-helper-${uniq}@articlepod.local`,
      role: "USER"
    }
  });
  const seeded = await seedReadyItem({ uniq, userId: user.id });

  try {
    const first = await ensurePublicEpisodeShareLink(user.id, seeded.item.id);
    const second = await ensurePublicEpisodeShareLink(user.id, seeded.item.id);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.share.id, second.share.id);
    assert.equal(first.shareUrl, second.shareUrl);

    const revoked = await revokePublicEpisodeShareLink(user.id, seeded.item.id);
    assert.equal(revoked, 1);

    const recreated = await ensurePublicEpisodeShareLink(user.id, seeded.item.id);
    assert.equal(recreated.created, true);
    assert.notEqual(recreated.share.id, first.share.id);
    assert.notEqual(recreated.shareUrl, first.shareUrl);
  } finally {
    await cleanupUserTree(user.id, [seeded.audioPath]);
  }
});

test("share episode route enforces ownership and shareable state", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const [owner, other] = await Promise.all([
    prisma.user.create({ data: { email: `share-owner-${uniq}@articlepod.local`, role: "USER" } }),
    prisma.user.create({ data: { email: `share-other-${uniq}@articlepod.local`, role: "USER" } })
  ]);
  const [ownerSession, otherSession] = await Promise.all([createSession(owner.id), createSession(other.id)]);
  const ready = await seedReadyItem({ uniq, userId: owner.id });
  const notReady = await prisma.item.create({
    data: {
      userId: owner.id,
      sourceType: "URL",
      sourceUrl: `https://example.com/not-ready/${uniq}`,
      status: "PROCESSING"
    }
  });

  try {
    const createRequest = new NextRequest(`http://localhost/api/share/episode/${ready.item.id}`, {
      method: "POST",
      headers: {
        cookie: `articlepod_session=${ownerSession}`
      }
    });
    const created = await postEpisodeShare(createRequest, { params: { itemId: ready.item.id } });
    assert.equal(created.status, 200);
    const createdJson = (await created.json()) as { ok: boolean; share_url: string; created: boolean };
    assert.equal(createdJson.ok, true);
    assert.equal(createdJson.created, true);

    const repeated = await postEpisodeShare(createRequest, { params: { itemId: ready.item.id } });
    const repeatedJson = (await repeated.json()) as { ok: boolean; share_url: string; created: boolean };
    assert.equal(repeated.status, 200);
    assert.equal(repeatedJson.created, false);
    assert.equal(repeatedJson.share_url, createdJson.share_url);

    const unauthorized = await postEpisodeShare(
      new NextRequest(`http://localhost/api/share/episode/${ready.item.id}`, {
        method: "POST",
        headers: {
          cookie: `articlepod_session=${otherSession}`
        }
      }),
      { params: { itemId: ready.item.id } }
    );
    assert.equal(unauthorized.status, 404);

    const invalidState = await postEpisodeShare(
      new NextRequest(`http://localhost/api/share/episode/${notReady.id}`, {
        method: "POST",
        headers: {
          cookie: `articlepod_session=${ownerSession}`
        }
      }),
      { params: { itemId: notReady.id } }
    );
    assert.equal(invalidState.status, 409);

    const deleted = await deleteEpisodeShare(
      new NextRequest(`http://localhost/api/share/episode/${ready.item.id}`, {
        method: "DELETE",
        headers: {
          cookie: `articlepod_session=${ownerSession}`
        }
      }),
      { params: { itemId: ready.item.id } }
    );
    assert.equal(deleted.status, 200);
    const deletedJson = (await deleted.json()) as { ok: boolean; revoked: number };
    assert.equal(deletedJson.revoked, 1);
  } finally {
    await cleanupUserTree(owner.id, [ready.audioPath]);
    await cleanupUserTree(other.id, []);
  }
});

test("shared episode page renders branded playback with noindex metadata", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: `share-page-${uniq}@articlepod.local`,
      role: "USER",
      name: "Private Owner"
    }
  });
  const seeded = await seedReadyItem({ uniq, userId: user.id });

  try {
    const share = await ensurePublicEpisodeShareLink(user.id, seeded.item.id);
    const { shareId, sig } = parseShareUrl(share.shareUrl);
    const metadata = await generateMetadata({ params: { shareId, sig } });
    assert.equal(metadata.robots && typeof metadata.robots === "object" ? metadata.robots.index : undefined, false);
    assert.equal(metadata.title, `${seeded.episode.title} | Shared Episode`);

    const html = renderToStaticMarkup(await SharedEpisodePage({ params: { shareId, sig } }));
    assert.match(html, /Shared episode/);
    assert.match(html, /Download audio/);
    assert.match(html, /Create account/);
    assert.match(html, /Open original source/);
    assert.match(html, /This link only shares this episode\./);
    assert.doesNotMatch(html, /intentionally lightweight/);
    assert.doesNotMatch(html, /Private Owner/);
    assert.doesNotMatch(html, new RegExp(user.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const event = await prisma.analyticsEvent.findFirst({
      where: {
        eventType: "SHARE_PAGE_VIEWED",
        itemId: seeded.item.id
      }
    });
    assert.ok(event);
  } finally {
    await cleanupUserTree(user.id, [seeded.audioPath]);
  }
});

test("shared media route supports HEAD, downloads, byte ranges, and revoke", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: `share-media-${uniq}@articlepod.local`,
      role: "USER"
    }
  });
  const seeded = await seedReadyItem({ uniq, userId: user.id });

  try {
    const share = await ensurePublicEpisodeShareLink(user.id, seeded.item.id);
    const mediaUrl = new URL(buildPublicEpisodeMediaUrl(share.share, seeded.episode));
    const headResponse = await shareMediaHead(new NextRequest(mediaUrl.toString(), { method: "HEAD" }), {
      params: { path: seeded.audioPath.split("/") }
    });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("content-length"), String(seeded.payload.byteLength));

    const fullResponse = await shareMediaGet(new NextRequest(mediaUrl.toString()), {
      params: { path: seeded.audioPath.split("/") }
    });
    assert.equal(fullResponse.status, 200);
    assert.equal(Buffer.from(await fullResponse.arrayBuffer()).toString("utf8"), seeded.payload.toString("utf8"));

    const downloadUrl = new URL(buildPublicEpisodeMediaUrl(share.share, seeded.episode, { download: true }));
    const downloadResponse = await shareMediaGet(new NextRequest(downloadUrl.toString()), {
      params: { path: seeded.audioPath.split("/") }
    });
    assert.equal(downloadResponse.status, 200);
    assert.match(downloadResponse.headers.get("content-disposition") || "", /attachment/);

    const rangeResponse = await shareMediaGet(
      new NextRequest(mediaUrl.toString(), {
        headers: {
          range: "bytes=0-3"
        }
      }),
      {
        params: { path: seeded.audioPath.split("/") }
      }
    );
    assert.equal(rangeResponse.status, 206);
    assert.equal(rangeResponse.headers.get("content-range"), `bytes 0-3/${seeded.payload.byteLength}`);

    const playbackEvent = await prisma.analyticsEvent.findFirst({
      where: {
        eventType: "SHARE_PLAYBACK_STARTED",
        itemId: seeded.item.id
      }
    });
    assert.ok(playbackEvent);

    await revokePublicEpisodeShareLink(user.id, seeded.item.id);
    const revokedResponse = await shareMediaGet(new NextRequest(mediaUrl.toString()), {
      params: { path: seeded.audioPath.split("/") }
    });
    assert.equal(revokedResponse.status, 401);
  } finally {
    await cleanupUserTree(user.id, [seeded.audioPath]);
  }
});

test("share CTA route redirects and records CTA clicks for valid shares", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);
  const user = await prisma.user.create({
    data: {
      email: `share-cta-${uniq}@articlepod.local`,
      role: "USER"
    }
  });
  const seeded = await seedReadyItem({ uniq, userId: user.id });

  try {
    const share = await ensurePublicEpisodeShareLink(user.id, seeded.item.id);
    const { shareId, sig } = parseShareUrl(share.shareUrl);
    const response = await shareCtaGet(
      new NextRequest(`http://localhost/api/share/cta?sid=${encodeURIComponent(shareId)}&sig=${encodeURIComponent(sig)}&target=pricing`)
    );
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location") || "http://localhost").pathname, "/pricing");

    const event = await prisma.analyticsEvent.findFirst({
      where: {
        eventType: "SHARE_CTA_CLICKED",
        itemId: seeded.item.id
      }
    });
    assert.ok(event);
  } finally {
    await cleanupUserTree(user.id, [seeded.audioPath]);
  }
});
