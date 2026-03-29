import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { AnalyticsSourceType } from "@articlepod/core";
import { ensurePublicEpisodeShareLink, getAuthUserFromRequest, revokePublicEpisodeShareLink } from "@/lib/auth";
import { recordAnalyticsEventBestEffort, resolveUserAnalyticsProfile } from "@/lib/admin-analytics/events";
import { fromError, ok } from "@/lib/http";
import { webPrimaryStore, webUsesAzureTablePrimary } from "@/lib/metadata-primary-store";
import { prisma } from "@/lib/prisma";
import { isAudioAvailable } from "@/lib/audio-retention";

function normalizeSourceType(sourceType: string): AnalyticsSourceType | null {
  return sourceType === "URL" || sourceType === "PDF" || sourceType === "HTML_SNAPSHOT" ? sourceType : null;
}

async function findOwnerItemWithEpisode(itemId: string, userId: string) {
  if (webUsesAzureTablePrimary() && webPrimaryStore) {
    const [item, episode] = await Promise.all([webPrimaryStore.findItemById(itemId), webPrimaryStore.findEpisodeByItemId(itemId)]);
    if (!item || item.userId !== userId) {
      return null;
    }
    return {
      item,
      episode: episode && isAudioAvailable(episode.expiresAt) ? episode : null
    };
  }

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { episode: true }
  });
  if (!item || item.userId !== userId) {
    return null;
  }
  return {
    item,
    episode: item.episode && isAudioAvailable(item.episode.expiresAt) ? item.episode : null
  };
}

export async function POST(request: NextRequest, context: { params: { itemId: string } }) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      throw new Error("UNAUTHORIZED");
    }

    const owned = await findOwnerItemWithEpisode(context.params.itemId, user.id);
    if (!owned) {
      return ok({ ok: false, error_code: "NOT_FOUND", error_message: "Item not found." }, { status: 404 });
    }
    if (owned.item.status !== "READY" || !owned.episode) {
      return ok({ ok: false, error_code: "ITEM_NOT_SHAREABLE", error_message: "Only ready episodes can be shared." }, { status: 409 });
    }

    const share = await ensurePublicEpisodeShareLink(user.id, owned.item.id);
    if (share.created) {
      const profile = await resolveUserAnalyticsProfile(user.id);
      await recordAnalyticsEventBestEffort({
        eventType: "SHARE_LINK_CREATED",
        userId: user.id,
        itemId: owned.item.id,
        sourceType: normalizeSourceType(owned.item.sourceType),
        authMethod: profile.authMethod,
        segmentAuth: profile.segmentAuth,
        userRole: profile.userRole,
        dedupeKey: `share_link_created:${share.share.id}:${randomUUID()}`,
        metadata: {
          share_id: share.share.id,
          scope: share.share.scope
        }
      });
    }

    return ok({
      ok: true,
      share_id: share.share.id,
      share_url: share.shareUrl,
      created: share.created
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/share/episode/[itemId]"
    });
  }
}

export async function DELETE(request: NextRequest, context: { params: { itemId: string } }) {
  const requestId = request.headers.get("x-request-id") || undefined;
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      throw new Error("UNAUTHORIZED");
    }

    const owned = await findOwnerItemWithEpisode(context.params.itemId, user.id);
    if (!owned) {
      return ok({ ok: false, error_code: "NOT_FOUND", error_message: "Item not found." }, { status: 404 });
    }

    const revoked = await revokePublicEpisodeShareLink(user.id, owned.item.id);
    return ok({
      ok: true,
      revoked
    });
  } catch (error) {
    return fromError(error, {
      requestId,
      route: "/api/share/episode/[itemId]"
    });
  }
}
