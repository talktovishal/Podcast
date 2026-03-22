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
import { workerPrimaryStore, workerUsesAzureTablePrimary } from "../lib/metadata-primary-store.js";
import { syncDigestRunProjectionById } from "../lib/metadata-projection.js";

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

function isPrismaForeignKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      (error as { code: string }).code === "P2003"
  );
}

async function ensureDigestSettingsDefaults(now: Date): Promise<void> {
  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const usersWithoutSettings = await workerPrimaryStore.listUsersWithoutDigestSettings();
    if (usersWithoutSettings.length === 0) {
      return;
    }

    for (const user of usersWithoutSettings) {
      const timezone = "UTC";
      await workerPrimaryStore.upsertDigestSettings({
        id: user.id,
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
      });
    }
    return;
  }

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
      if (!isPrismaUniqueError(error) && !isPrismaForeignKeyError(error)) {
        throw error;
      }
    }
  }
}

async function markTicksProcessed(ticks: Array<{ id: string }>, processedAt: Date): Promise<void> {
  if (ticks.length === 0) {
    return;
  }

  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    await workerPrimaryStore.markDigestSchedulerTicksProcessed(
      ticks.map((tick) => tick.id),
      processedAt
    );
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
}): Promise<{ created: number; runIds: string[] }> {
  const { tx, settings, now, forceNow } = input;
  let created = 0;
  const runIds: string[] = [];
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
      const run = await tx.digestRun.create({
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
      runIds.push(run.id);
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
      const run = await tx.digestRun.create({
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
      runIds.push(run.id);
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

  return { created, runIds };
}

export async function scheduleDigestRuns(forceNow = false): Promise<ScheduleResult> {
  const now = new Date();
  await ensureDigestSettingsDefaults(now);

  const pendingTicks =
    workerUsesAzureTablePrimary() && workerPrimaryStore
      ? await workerPrimaryStore.listPendingDigestSchedulerTicks(20)
      : await prisma.digestSchedulerTick.findMany({
          where: {
            processedAt: null
          },
          orderBy: {
            requestedAt: "asc"
          },
          take: 20
        });
  const shouldForceNow = forceNow || pendingTicks.some((tick) => tick.forceNow);

  const settings =
    workerUsesAzureTablePrimary() && workerPrimaryStore
      ? shouldForceNow
        ? await workerPrimaryStore.listDigestSettings()
        : await workerPrimaryStore.listDueDigestSettings(now)
      : await prisma.userDigestSettings.findMany({
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
  const createdRunIds: string[] = [];
  for (const entry of settings) {
    const result =
      workerUsesAzureTablePrimary() && workerPrimaryStore
        ? await (async () => {
            let created = 0;
            const runIds: string[] = [];
            let nextDailyRunAt = entry.dailyNextRunAt;
            let nextWeeklyRunAt = entry.weeklyNextRunAt;

            const dailyEnabled = entry.dailyEmailEnabled || entry.dailyPodcastEnabled;
            const dailyDue = shouldForceNow || (dailyEnabled && entry.dailyNextRunAt && entry.dailyNextRunAt.getTime() <= now.getTime());
            if (dailyEnabled && dailyDue) {
              const window = computeLatestClosedDailyWindow({
                now,
                timezone: entry.timezone,
                dailyHour: entry.dailyHour,
                dailyMinute: entry.dailyMinute
              });
              const run = await workerPrimaryStore.createDigestRun({
                id: `${entry.userId}-daily-${window.periodKey}`,
                userId: entry.userId,
                cadence: "DAILY",
                periodKey: window.periodKey,
                windowStart: window.windowStart,
                windowEnd: window.windowEnd,
                scheduledFor: now,
                status: "QUEUED",
                targetLengthMinutes: entry.dailyLengthMinutes,
                emailEnabled: entry.dailyEmailEnabled,
                podcastEnabled: entry.dailyPodcastEnabled
              });
              if (run) {
                created += 1;
                runIds.push(run.id);
              }
              nextDailyRunAt = computeNextDailyRunAt({
                now,
                timezone: entry.timezone,
                dailyHour: entry.dailyHour,
                dailyMinute: entry.dailyMinute
              });
            }

            const weeklyEnabled = entry.weeklyEmailEnabled || entry.weeklyPodcastEnabled;
            const weeklyDue =
              shouldForceNow || (weeklyEnabled && entry.weeklyNextRunAt && entry.weeklyNextRunAt.getTime() <= now.getTime());
            if (weeklyEnabled && weeklyDue) {
              const window = computeLatestClosedWeeklyWindow({
                now,
                timezone: entry.timezone,
                weeklyDayOfWeek: entry.weeklyDayOfWeek,
                weeklyHour: entry.weeklyHour,
                weeklyMinute: entry.weeklyMinute
              });
              const run = await workerPrimaryStore.createDigestRun({
                id: `${entry.userId}-weekly-${window.periodKey}`,
                userId: entry.userId,
                cadence: "WEEKLY",
                periodKey: window.periodKey,
                windowStart: window.windowStart,
                windowEnd: window.windowEnd,
                scheduledFor: now,
                status: "QUEUED",
                targetLengthMinutes: entry.weeklyLengthMinutes,
                emailEnabled: entry.weeklyEmailEnabled,
                podcastEnabled: entry.weeklyPodcastEnabled
              });
              if (run) {
                created += 1;
                runIds.push(run.id);
              }
              nextWeeklyRunAt = computeNextWeeklyRunAt({
                now,
                timezone: entry.timezone,
                weeklyDayOfWeek: entry.weeklyDayOfWeek,
                weeklyHour: entry.weeklyHour,
                weeklyMinute: entry.weeklyMinute
              });
            }

            if (dailyDue || weeklyDue) {
              await workerPrimaryStore.upsertDigestSettings({
                id: entry.id,
                userId: entry.userId,
                timezone: entry.timezone,
                dailyEmailEnabled: entry.dailyEmailEnabled,
                dailyPodcastEnabled: entry.dailyPodcastEnabled,
                dailyHour: entry.dailyHour,
                dailyMinute: entry.dailyMinute,
                dailyLengthMinutes: entry.dailyLengthMinutes,
                dailyNextRunAt: nextDailyRunAt,
                weeklyEmailEnabled: entry.weeklyEmailEnabled,
                weeklyPodcastEnabled: entry.weeklyPodcastEnabled,
                weeklyDayOfWeek: entry.weeklyDayOfWeek,
                weeklyHour: entry.weeklyHour,
                weeklyMinute: entry.weeklyMinute,
                weeklyLengthMinutes: entry.weeklyLengthMinutes,
                weeklyNextRunAt: nextWeeklyRunAt
              });
            }

            return { created, runIds };
          })()
        : await prisma.$transaction((tx) =>
            scheduleForUser({
              tx,
              settings: entry,
              now,
              forceNow: shouldForceNow
            })
          );
    scheduledRuns += result.created;
    createdRunIds.push(...result.runIds);
  }

  await markTicksProcessed(pendingTicks, now);
  await Promise.all(createdRunIds.map((runId) => syncDigestRunProjectionById(runId)));

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
  if (workerUsesAzureTablePrimary() && workerPrimaryStore) {
    const pending = await workerPrimaryStore.listPendingDigestSchedulerTicks(1);
    return pending.length > 0;
  }

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
