import {
  computeLatestClosedDailyWindow,
  computeLatestClosedWeeklyWindow,
  computeNextDailyRunAt,
  computeNextWeeklyRunAt
} from "@articlepod/core";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { workerEnv } from "../lib/env.js";
import { workerLogger } from "../lib/logger.js";

type ScheduleResult = {
  scheduledRuns: number;
  hadTickSignal: boolean;
};

function isPrismaUniqueError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      (error as { code: string }).code === "P2002"
  );
}

async function ensureDigestSettingsDefaults(now: Date): Promise<void> {
  const usersWithoutSettings = await prisma.user.findMany({
    where: {
      digestSettings: {
        is: null
      }
    },
    select: {
      id: true
    }
  });

  if (usersWithoutSettings.length === 0) {
    return;
  }

  for (const user of usersWithoutSettings) {
    const timezone = "UTC";
    try {
      await prisma.userDigestSettings.create({
        data: {
          userId: user.id,
          timezone,
          dailyEmailEnabled: false,
          dailyPodcastEnabled: false,
          dailyHour: 16,
          dailyMinute: 0,
          dailyLengthMinutes: 5,
          dailyNextRunAt: computeNextDailyRunAt({
            now,
            timezone,
            dailyHour: 16,
            dailyMinute: 0
          }),
          weeklyEmailEnabled: true,
          weeklyPodcastEnabled: true,
          weeklyDayOfWeek: 5,
          weeklyHour: 16,
          weeklyMinute: 0,
          weeklyLengthMinutes: 15,
          weeklyNextRunAt: computeNextWeeklyRunAt({
            now,
            timezone,
            weeklyDayOfWeek: 5,
            weeklyHour: 16,
            weeklyMinute: 0
          })
        }
      });
    } catch (error) {
      if (!isPrismaUniqueError(error)) {
        throw error;
      }
    }
  }
}

async function markTicksProcessed(ticks: Array<{ id: string }>, processedAt: Date): Promise<void> {
  if (ticks.length === 0) {
    return;
  }

  await prisma.digestSchedulerTick.updateMany({
    where: {
      id: {
        in: ticks.map((tick) => tick.id)
      }
    },
    data: {
      processedAt
    }
  });
}

async function scheduleForUser(input: {
  tx: Prisma.TransactionClient;
  settings: {
    userId: string;
    timezone: string;
    dailyEmailEnabled: boolean;
    dailyPodcastEnabled: boolean;
    dailyHour: number;
    dailyMinute: number;
    dailyLengthMinutes: number;
    dailyNextRunAt: Date | null;
    weeklyEmailEnabled: boolean;
    weeklyPodcastEnabled: boolean;
    weeklyDayOfWeek: number;
    weeklyHour: number;
    weeklyMinute: number;
    weeklyLengthMinutes: number;
    weeklyNextRunAt: Date | null;
  };
  now: Date;
  forceNow: boolean;
}): Promise<number> {
  const { tx, settings, now, forceNow } = input;
  let created = 0;
  let nextDailyRunAt = settings.dailyNextRunAt;
  let nextWeeklyRunAt = settings.weeklyNextRunAt;

  const dailyEnabled = settings.dailyEmailEnabled || settings.dailyPodcastEnabled;
  const dailyDue = forceNow || (dailyEnabled && settings.dailyNextRunAt && settings.dailyNextRunAt.getTime() <= now.getTime());
  if (dailyEnabled && dailyDue) {
    const window = computeLatestClosedDailyWindow({
      now,
      timezone: settings.timezone,
      dailyHour: settings.dailyHour,
      dailyMinute: settings.dailyMinute
    });
    try {
      await tx.digestRun.create({
        data: {
          userId: settings.userId,
          cadence: "DAILY",
          periodKey: window.periodKey,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
          scheduledFor: now,
          status: "QUEUED",
          targetLengthMinutes: settings.dailyLengthMinutes,
          emailEnabled: settings.dailyEmailEnabled,
          podcastEnabled: settings.dailyPodcastEnabled
        }
      });
      created += 1;
    } catch (error) {
      if (!isPrismaUniqueError(error)) {
        throw error;
      }
    }
    nextDailyRunAt = computeNextDailyRunAt({
      now,
      timezone: settings.timezone,
      dailyHour: settings.dailyHour,
      dailyMinute: settings.dailyMinute
    });
  }

  const weeklyEnabled = settings.weeklyEmailEnabled || settings.weeklyPodcastEnabled;
  const weeklyDue = forceNow || (weeklyEnabled && settings.weeklyNextRunAt && settings.weeklyNextRunAt.getTime() <= now.getTime());
  if (weeklyEnabled && weeklyDue) {
    const window = computeLatestClosedWeeklyWindow({
      now,
      timezone: settings.timezone,
      weeklyDayOfWeek: settings.weeklyDayOfWeek,
      weeklyHour: settings.weeklyHour,
      weeklyMinute: settings.weeklyMinute
    });
    try {
      await tx.digestRun.create({
        data: {
          userId: settings.userId,
          cadence: "WEEKLY",
          periodKey: window.periodKey,
          windowStart: window.windowStart,
          windowEnd: window.windowEnd,
          scheduledFor: now,
          status: "QUEUED",
          targetLengthMinutes: settings.weeklyLengthMinutes,
          emailEnabled: settings.weeklyEmailEnabled,
          podcastEnabled: settings.weeklyPodcastEnabled
        }
      });
      created += 1;
    } catch (error) {
      if (!isPrismaUniqueError(error)) {
        throw error;
      }
    }
    nextWeeklyRunAt = computeNextWeeklyRunAt({
      now,
      timezone: settings.timezone,
      weeklyDayOfWeek: settings.weeklyDayOfWeek,
      weeklyHour: settings.weeklyHour,
      weeklyMinute: settings.weeklyMinute
    });
  }

  if (dailyDue || weeklyDue) {
    await tx.userDigestSettings.update({
      where: { userId: settings.userId },
      data: {
        dailyNextRunAt: nextDailyRunAt,
        weeklyNextRunAt: nextWeeklyRunAt
      }
    });
  }

  return created;
}

export async function scheduleDigestRuns(forceNow = false): Promise<ScheduleResult> {
  const now = new Date();
  await ensureDigestSettingsDefaults(now);

  const pendingTicks = await prisma.digestSchedulerTick.findMany({
    where: {
      processedAt: null
    },
    orderBy: {
      requestedAt: "asc"
    },
    take: 20
  });
  const shouldForceNow = forceNow || pendingTicks.some((tick) => tick.forceNow);

  const settings = await prisma.userDigestSettings.findMany({
    where: shouldForceNow
      ? undefined
      : {
          OR: [
            {
              dailyNextRunAt: {
                lte: now
              }
            },
            {
              weeklyNextRunAt: {
                lte: now
              }
            }
          ]
        }
  });

  let scheduledRuns = 0;
  for (const entry of settings) {
    scheduledRuns += await prisma.$transaction((tx) =>
      scheduleForUser({
        tx,
        settings: entry,
        now,
        forceNow: shouldForceNow
      })
    );
  }

  await markTicksProcessed(pendingTicks, now);

  if (scheduledRuns > 0 || pendingTicks.length > 0) {
    await workerLogger.info("Digest scheduler pass completed", {
      scheduledRuns,
      tickSignals: pendingTicks.length,
      forceNow: shouldForceNow
    });
  }

  return {
    scheduledRuns,
    hadTickSignal: pendingTicks.length > 0
  };
}

export async function hasPendingDigestSchedulerTick(): Promise<boolean> {
  const pending = await prisma.digestSchedulerTick.findFirst({
    where: {
      processedAt: null
    },
    select: {
      id: true
    }
  });
  return Boolean(pending);
}
