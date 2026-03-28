import { createHmac, timingSafeEqual } from "node:crypto";
import { webPrimaryStore, webUsesAzureTablePrimary } from "./metadata-primary-store";
import type { PrimaryShareTokenRecord } from "./metadata-primary-auth";
import { findPrimaryShareTokenById } from "./metadata-primary-auth";
import { env } from "./env";
import { prisma } from "./prisma";

export const PUBLIC_EPISODE_SHARE_SCOPE_PREFIX = "public_episode_item:";

type ShareSignatureInput = {
  shareId: string;
  tokenHash: string;
  scope: string;
};

type ShareMediaSignatureInput = ShareSignatureInput & {
  episodeId: string;
  path: string;
};

export type PublicEpisodeShareContext = {
  share: PrimaryShareTokenRecord;
  item: {
    id: string;
    userId: string;
    title: string | null;
    sourceType: string;
    sourceUrl: string | null;
    status: string;
  };
  episode: {
    id: string;
    itemId: string;
    userId: string;
    guid: string;
    title: string;
    description: string;
    audioPath: string;
    audioBytes: number;
    mimeType: string;
    publishedAt: Date;
  };
};

function shareSigningKey(tokenHash: string): string {
  return env.mediaSigningKey || tokenHash;
}

function timingSafeMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function pageSignaturePayload(input: ShareSignatureInput): string {
  return `share-page:v1:${input.shareId}:${input.tokenHash}:${input.scope}`;
}

function mediaSignaturePayload(input: ShareMediaSignatureInput): string {
  return `share-media:v1:${input.shareId}:${input.tokenHash}:${input.scope}:${input.episodeId}:${input.path}`;
}

export function buildPublicEpisodeShareScope(itemId: string): string {
  return `${PUBLIC_EPISODE_SHARE_SCOPE_PREFIX}${itemId}`;
}

export function parsePublicEpisodeShareItemId(scope: string): string | null {
  return scope.startsWith(PUBLIC_EPISODE_SHARE_SCOPE_PREFIX) ? scope.slice(PUBLIC_EPISODE_SHARE_SCOPE_PREFIX.length) : null;
}

export function isPublicEpisodeShareScope(scope: string): boolean {
  return parsePublicEpisodeShareItemId(scope) !== null;
}

export function isExpiredShare(share: Pick<PrimaryShareTokenRecord, "expiresAt">): boolean {
  return Boolean(share.expiresAt && share.expiresAt.getTime() < Date.now());
}

export function signPublicEpisodeShareSignature(input: ShareSignatureInput): string {
  return createHmac("sha256", shareSigningKey(input.tokenHash)).update(pageSignaturePayload(input)).digest("base64url");
}

export function verifyPublicEpisodeShareSignature(input: ShareSignatureInput, signature: string): boolean {
  return timingSafeMatch(signPublicEpisodeShareSignature(input), signature);
}

export function signPublicEpisodeMediaToken(input: ShareMediaSignatureInput): string {
  return createHmac("sha256", shareSigningKey(input.tokenHash)).update(mediaSignaturePayload(input)).digest("base64url");
}

export function verifyPublicEpisodeMediaToken(input: ShareMediaSignatureInput, signature: string): boolean {
  return timingSafeMatch(signPublicEpisodeMediaToken(input), signature);
}

export function buildPublicEpisodeShareUrl(share: Pick<PrimaryShareTokenRecord, "id" | "tokenHash" | "scope">): string {
  const sig = signPublicEpisodeShareSignature({
    shareId: share.id,
    tokenHash: share.tokenHash,
    scope: share.scope
  });
  return `${env.appUrl}/share/episode/${encodeURIComponent(share.id)}/${encodeURIComponent(sig)}`;
}

export function buildPublicEpisodeMediaUrl(
  share: Pick<PrimaryShareTokenRecord, "id" | "tokenHash" | "scope">,
  episode: Pick<PublicEpisodeShareContext["episode"], "id" | "audioPath">,
  options?: { download?: boolean }
): string {
  const token = signPublicEpisodeMediaToken({
    shareId: share.id,
    tokenHash: share.tokenHash,
    scope: share.scope,
    episodeId: episode.id,
    path: episode.audioPath
  });
  const url = new URL(`/api/share-media/${episode.audioPath}`, env.appUrl);
  url.searchParams.set("sid", share.id);
  url.searchParams.set("mt", token);
  url.searchParams.set("eid", episode.id);
  if (options?.download) {
    url.searchParams.set("download", "1");
  }
  return url.toString();
}

export async function getPublicEpisodeShareContextById(shareId: string): Promise<PublicEpisodeShareContext | null> {
  const share = await findPrimaryShareTokenById(shareId);
  if (!share || isExpiredShare(share)) {
    return null;
  }

  const itemId = parsePublicEpisodeShareItemId(share.scope);
  if (!itemId) {
    return null;
  }

  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const [item, episode] = await Promise.all([webPrimaryStore.findItemById(itemId), webPrimaryStore.findEpisodeByItemId(itemId)]);
    if (!item || !episode) {
      return null;
    }

    return {
      share,
      item: {
        id: item.id,
        userId: item.userId,
        title: item.title,
        sourceType: item.sourceType,
        sourceUrl: item.sourceUrl,
        status: item.status
      },
      episode
    };
  }

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      episode: true
    }
  });
  if (!item || !item.episode) {
    return null;
  }

  return {
    share,
    item: {
      id: item.id,
      userId: item.userId,
      title: item.title,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      status: item.status
    },
    episode: {
      id: item.episode.id,
      itemId: item.episode.itemId,
      userId: item.userId,
      guid: item.episode.guid,
      title: item.episode.title,
      description: item.episode.description,
      audioPath: item.episode.audioPath,
      audioBytes: item.episode.audioBytes,
      mimeType: item.episode.mimeType,
      publishedAt: item.episode.publishedAt
    }
  };
}
