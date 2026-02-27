import { sha256 } from "../utils/hash";

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
};

function toInt(value: string): number {
  return Number.parseInt(value, 10);
}

function extractZonedParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short"
  });

  const parts = formatter.formatToParts(date);
  const mapped = new Map<string, string>();
  for (const part of parts) {
    mapped.set(part.type, part.value);
  }

  const weekday = mapped.get("weekday") || "Sun";
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);

  return {
    year: toInt(mapped.get("year") || "0"),
    month: toInt(mapped.get("month") || "1"),
    day: toInt(mapped.get("day") || "1"),
    hour: toInt(mapped.get("hour") || "0"),
    minute: toInt(mapped.get("minute") || "0"),
    second: toInt(mapped.get("second") || "0"),
    dayOfWeek: dayOfWeek >= 0 ? dayOfWeek : 0
  };
}

function diffLocalMs(current: ZonedDateParts, target: ZonedDateParts): number {
  const currentUtc = Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second);
  const targetUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
  return targetUtc - currentUtc;
}

function zonedTimeToUtc(input: Omit<ZonedDateParts, "dayOfWeek">, timeZone: string): Date {
  let guessMs = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second);
  for (let i = 0; i < 5; i += 1) {
    const current = extractZonedParts(new Date(guessMs), timeZone);
    const nextDiff = diffLocalMs(current, {
      ...input,
      dayOfWeek: current.dayOfWeek
    });
    if (nextDiff === 0) {
      break;
    }
    guessMs += nextDiff;
  }
  return new Date(guessMs);
}

function shiftLocalDate(parts: ZonedDateParts, deltaDays: number): Omit<ZonedDateParts, "hour" | "minute" | "second" | "dayOfWeek"> {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + deltaDays * 24 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function formatPeriodKey(localDate: { year: number; month: number; day: number }): string {
  const month = String(localDate.month).padStart(2, "0");
  const day = String(localDate.day).padStart(2, "0");
  return `${localDate.year}-${month}-${day}`;
}

export type DigestWindowResult = {
  windowStart: Date;
  windowEnd: Date;
  periodKey: string;
};

export function computeLatestClosedDailyWindow(input: {
  now: Date;
  timezone: string;
  dailyHour: number;
  dailyMinute: number;
}): DigestWindowResult {
  const now = input.now;
  const localNow = extractZonedParts(now, input.timezone);
  const todayBoundary = zonedTimeToUtc(
    {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
      hour: input.dailyHour,
      minute: input.dailyMinute,
      second: 0
    },
    input.timezone
  );

  const boundaryLocalDate =
    now.getTime() >= todayBoundary.getTime()
      ? { year: localNow.year, month: localNow.month, day: localNow.day }
      : shiftLocalDate(localNow, -1);
  const windowEnd = zonedTimeToUtc(
    {
      ...boundaryLocalDate,
      hour: input.dailyHour,
      minute: input.dailyMinute,
      second: 0
    },
    input.timezone
  );

  return {
    windowStart: new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000),
    windowEnd,
    periodKey: formatPeriodKey(boundaryLocalDate)
  };
}

export function computeLatestClosedWeeklyWindow(input: {
  now: Date;
  timezone: string;
  weeklyDayOfWeek: number;
  weeklyHour: number;
  weeklyMinute: number;
}): DigestWindowResult {
  const now = input.now;
  const localNow = extractZonedParts(now, input.timezone);
  const daysSinceTarget = (localNow.dayOfWeek - input.weeklyDayOfWeek + 7) % 7;
  let boundaryLocalDate = shiftLocalDate(localNow, -daysSinceTarget);
  let boundary = zonedTimeToUtc(
    {
      ...boundaryLocalDate,
      hour: input.weeklyHour,
      minute: input.weeklyMinute,
      second: 0
    },
    input.timezone
  );

  if (now.getTime() < boundary.getTime()) {
    boundaryLocalDate = shiftLocalDate(localNow, -(daysSinceTarget + 7));
    boundary = zonedTimeToUtc(
      {
        ...boundaryLocalDate,
        hour: input.weeklyHour,
        minute: input.weeklyMinute,
        second: 0
      },
      input.timezone
    );
  }

  return {
    windowStart: new Date(boundary.getTime() - 7 * 24 * 60 * 60 * 1000),
    windowEnd: boundary,
    periodKey: formatPeriodKey(boundaryLocalDate)
  };
}

export function computeNextDailyRunAt(input: {
  now: Date;
  timezone: string;
  dailyHour: number;
  dailyMinute: number;
}): Date {
  const localNow = extractZonedParts(input.now, input.timezone);
  let localDate = { year: localNow.year, month: localNow.month, day: localNow.day };
  let candidate = zonedTimeToUtc(
    {
      ...localDate,
      hour: input.dailyHour,
      minute: input.dailyMinute,
      second: 0
    },
    input.timezone
  );

  if (candidate.getTime() <= input.now.getTime()) {
    localDate = shiftLocalDate(localNow, 1);
    candidate = zonedTimeToUtc(
      {
        ...localDate,
        hour: input.dailyHour,
        minute: input.dailyMinute,
        second: 0
      },
      input.timezone
    );
  }

  return candidate;
}

export function computeNextWeeklyRunAt(input: {
  now: Date;
  timezone: string;
  weeklyDayOfWeek: number;
  weeklyHour: number;
  weeklyMinute: number;
}): Date {
  const localNow = extractZonedParts(input.now, input.timezone);
  const daysUntilTarget = (input.weeklyDayOfWeek - localNow.dayOfWeek + 7) % 7;
  let localDate = shiftLocalDate(localNow, daysUntilTarget);
  let candidate = zonedTimeToUtc(
    {
      ...localDate,
      hour: input.weeklyHour,
      minute: input.weeklyMinute,
      second: 0
    },
    input.timezone
  );

  if (candidate.getTime() <= input.now.getTime()) {
    localDate = shiftLocalDate(localNow, daysUntilTarget + 7);
    candidate = zonedTimeToUtc(
      {
        ...localDate,
        hour: input.weeklyHour,
        minute: input.weeklyMinute,
        second: 0
      },
      input.timezone
    );
  }

  return candidate;
}

export function buildDigestGuid(input: { userId: string; cadence: "DAILY" | "WEEKLY"; periodKey: string }): string {
  return `digest-${input.cadence.toLowerCase()}-${sha256(`${input.userId}:${input.cadence}:${input.periodKey}`).slice(0, 24)}`;
}
