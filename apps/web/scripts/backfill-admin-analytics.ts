import { recordAnalyticsEvent } from "../src/lib/admin-analytics/events";
import { prisma } from "../src/lib/prisma";

function mapUserProfile(input: { role: string; providers: string[] }) {
  const role: "ADMIN" | "USER" = input.role === "ADMIN" ? "ADMIN" : "USER";
  const providers = new Set(input.providers.map((provider) => provider.toLowerCase()));
  if (providers.size === 0) {
    return {
      role,
      authMethod: "LOCAL" as const,
      segmentAuth: "LOCAL_ONLY" as const
    };
  }
  if (providers.size === 1 && providers.has("google")) {
    return {
      role,
      authMethod: "GOOGLE" as const,
      segmentAuth: "OAUTH_LINKED" as const
    };
  }
  if (providers.size === 1 && providers.has("apple")) {
    return {
      role,
      authMethod: "APPLE" as const,
      segmentAuth: "OAUTH_LINKED" as const
    };
  }
  return {
    role,
    authMethod: "OAUTH_LINKED" as const,
    segmentAuth: "OAUTH_LINKED" as const
  };
}

async function backfill() {
  const users = await prisma.user.findMany({
    include: {
      oauthIdentities: {
        select: {
          provider: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  const profileByUserId = new Map<string, ReturnType<typeof mapUserProfile>>();
  for (const user of users) {
    const profile = mapUserProfile({
      role: user.role,
      providers: user.oauthIdentities.map((identity) => identity.provider)
    });
    profileByUserId.set(user.id, profile);
    await recordAnalyticsEvent({
      eventType: "USER_SIGNUP",
      userId: user.id,
      authMethod: profile.authMethod,
      segmentAuth: profile.segmentAuth,
      userRole: profile.role,
      dedupeKey: `user_signup:${user.id}`,
      occurredAt: user.createdAt,
      metadata: {
        backfilled: true
      }
    });
  }

  const sessions = await prisma.session.findMany({
    orderBy: { createdAt: "asc" }
  });
  for (const session of sessions) {
    const profile = profileByUserId.get(session.userId);
    await recordAnalyticsEvent({
      eventType: "USER_LOGIN",
      userId: session.userId,
      authMethod: profile?.authMethod ?? "LOCAL",
      segmentAuth: profile?.segmentAuth ?? "LOCAL_ONLY",
      userRole: profile?.role ?? "USER",
      dedupeKey: `user_login:session:${session.id}`,
      occurredAt: session.createdAt,
      metadata: {
        backfilled: true,
        session_id: session.id
      }
    });
  }

  const items = await prisma.item.findMany({
    select: {
      id: true,
      userId: true,
      sourceType: true,
      createdAt: true,
      status: true,
      updatedAt: true,
      episode: {
        select: {
          publishedAt: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
  for (const item of items) {
    const profile = profileByUserId.get(item.userId);
    const sourceType =
      item.sourceType === "URL" || item.sourceType === "PDF" || item.sourceType === "HTML_SNAPSHOT" ? item.sourceType : "URL";

    await recordAnalyticsEvent({
      eventType: "ITEM_SUBMITTED",
      userId: item.userId,
      itemId: item.id,
      sourceType,
      authMethod: profile?.authMethod ?? "LOCAL",
      segmentAuth: profile?.segmentAuth ?? "LOCAL_ONLY",
      userRole: profile?.role ?? "USER",
      dedupeKey: `item_submitted:${item.id}`,
      occurredAt: item.createdAt,
      metadata: {
        backfilled: true
      }
    });

    if (item.status === "READY") {
      await recordAnalyticsEvent({
        eventType: "ITEM_READY",
        userId: item.userId,
        itemId: item.id,
        sourceType,
        authMethod: profile?.authMethod ?? "LOCAL",
        segmentAuth: profile?.segmentAuth ?? "LOCAL_ONLY",
        userRole: profile?.role ?? "USER",
        dedupeKey: `item_ready:${item.id}`,
        occurredAt: item.episode?.publishedAt ?? item.updatedAt,
        metadata: {
          backfilled: true
        }
      });
    }

    if (item.status === "FAILED") {
      await recordAnalyticsEvent({
        eventType: "ITEM_FAILED",
        userId: item.userId,
        itemId: item.id,
        sourceType,
        authMethod: profile?.authMethod ?? "LOCAL",
        segmentAuth: profile?.segmentAuth ?? "LOCAL_ONLY",
        userRole: profile?.role ?? "USER",
        dedupeKey: `item_failed:${item.id}`,
        occurredAt: item.updatedAt,
        metadata: {
          backfilled: true
        }
      });
    }
  }

  const earliestSignup = users[0]?.createdAt ?? new Date();
  const earliestSession = sessions[0]?.createdAt ?? earliestSignup;
  const earliestItem = items[0]?.createdAt ?? earliestSignup;
  const now = new Date();

  const coverageRows = [
    {
      metricKey: "user_signups",
      coverageStartAt: earliestSignup,
      isBackfilled: true,
      notes: "Backfilled from User.createdAt"
    },
    {
      metricKey: "user_logins",
      coverageStartAt: earliestSession,
      isBackfilled: true,
      notes: "Backfilled from Session.createdAt"
    },
    {
      metricKey: "item_submitted",
      coverageStartAt: earliestItem,
      isBackfilled: true,
      notes: "Backfilled from Item.createdAt"
    },
    {
      metricKey: "item_ready",
      coverageStartAt: earliestItem,
      isBackfilled: true,
      notes: "Backfilled from Item/Episode timestamps"
    },
    {
      metricKey: "item_failed",
      coverageStartAt: earliestItem,
      isBackfilled: true,
      notes: "Backfilled from Item status history"
    },
    {
      metricKey: "playback_starts",
      coverageStartAt: now,
      isBackfilled: false,
      notes: "Forward-only from media route instrumentation"
    }
  ];

  for (const row of coverageRows) {
    await prisma.analyticsCoverage.upsert({
      where: {
        metricKey: row.metricKey
      },
      update: {
        coverageStartAt: row.coverageStartAt,
        isBackfilled: row.isBackfilled,
        notes: row.notes
      },
      create: row
    });
  }
}

backfill()
  .then(async () => {
    // eslint-disable-next-line no-console
    console.log("Admin analytics backfill complete.");
  })
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
