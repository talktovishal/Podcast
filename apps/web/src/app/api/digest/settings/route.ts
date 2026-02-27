import { computeNextDailyRunAt, computeNextWeeklyRunAt, updateDigestSettingsSchema } from "@articlepod/core";
import { NextRequest, NextResponse } from "next/server";
import { ensureUserDigestSettings, getAuthUserFromRequest } from "@/lib/auth";
import { fromError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const settings = await ensureUserDigestSettings(user.id);
    return NextResponse.json({
      ok: true,
      settings
    });
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/digest/settings"
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error_code: "UNAUTHORIZED", error_message: "Unauthorized" }, { status: 401 });
    }

    const payload = updateDigestSettingsSchema.parse(await request.json());
    await ensureUserDigestSettings(user.id);
    const now = new Date();

    const settings = await prisma.userDigestSettings.update({
      where: { userId: user.id },
      data: {
        timezone: payload.timezone,
        dailyEmailEnabled: payload.dailyEmailEnabled,
        dailyPodcastEnabled: payload.dailyPodcastEnabled,
        dailyHour: payload.dailyHour,
        dailyMinute: payload.dailyMinute,
        dailyLengthMinutes: payload.dailyLengthMinutes,
        dailyNextRunAt: computeNextDailyRunAt({
          now,
          timezone: payload.timezone,
          dailyHour: payload.dailyHour,
          dailyMinute: payload.dailyMinute
        }),
        weeklyEmailEnabled: payload.weeklyEmailEnabled,
        weeklyPodcastEnabled: payload.weeklyPodcastEnabled,
        weeklyDayOfWeek: payload.weeklyDayOfWeek,
        weeklyHour: payload.weeklyHour,
        weeklyMinute: payload.weeklyMinute,
        weeklyLengthMinutes: payload.weeklyLengthMinutes,
        weeklyNextRunAt: computeNextWeeklyRunAt({
          now,
          timezone: payload.timezone,
          weeklyDayOfWeek: payload.weeklyDayOfWeek,
          weeklyHour: payload.weeklyHour,
          weeklyMinute: payload.weeklyMinute
        })
      }
    });

    return NextResponse.json({
      ok: true,
      settings
    });
  } catch (error) {
    return fromError(error, {
      requestId: request.headers.get("x-request-id") || undefined,
      route: "/api/digest/settings"
    });
  }
}
