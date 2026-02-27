import assert from "node:assert/strict";
import test from "node:test";
import {
  StubSummaryProvider,
  computeLatestClosedDailyWindow,
  computeLatestClosedWeeklyWindow,
  computeNextDailyRunAt,
  computeNextWeeklyRunAt,
  digestTargetWords
} from "../src";

test("digestTargetWords maps canonical minute buckets", () => {
  assert.equal(digestTargetWords(5), 700);
  assert.equal(digestTargetWords(15), 2100);
  assert.equal(digestTargetWords(30), 4200);
});

test("computeLatestClosedDailyWindow resolves local-time boundary", () => {
  const now = new Date("2026-02-27T23:30:00.000Z"); // 18:30 in America/New_York
  const result = computeLatestClosedDailyWindow({
    now,
    timezone: "America/New_York",
    dailyHour: 16,
    dailyMinute: 0
  });

  assert.equal(result.periodKey, "2026-02-27");
  assert.equal(result.windowEnd.toISOString(), "2026-02-27T21:00:00.000Z");
  assert.equal(result.windowStart.toISOString(), "2026-02-26T21:00:00.000Z");
});

test("computeLatestClosedWeeklyWindow resolves local weekday boundary", () => {
  const now = new Date("2026-02-27T23:30:00.000Z"); // Friday 18:30 in America/New_York
  const result = computeLatestClosedWeeklyWindow({
    now,
    timezone: "America/New_York",
    weeklyDayOfWeek: 5,
    weeklyHour: 16,
    weeklyMinute: 0
  });

  assert.equal(result.periodKey, "2026-02-27");
  assert.equal(result.windowEnd.toISOString(), "2026-02-27T21:00:00.000Z");
  assert.equal(result.windowStart.toISOString(), "2026-02-20T21:00:00.000Z");
});

test("computeNextRunAt helpers return future local boundary", () => {
  const now = new Date("2026-02-27T23:30:00.000Z");

  const nextDaily = computeNextDailyRunAt({
    now,
    timezone: "America/New_York",
    dailyHour: 16,
    dailyMinute: 0
  });
  assert.equal(nextDaily.toISOString(), "2026-02-28T21:00:00.000Z");

  const nextWeekly = computeNextWeeklyRunAt({
    now,
    timezone: "America/New_York",
    weeklyDayOfWeek: 5,
    weeklyHour: 16,
    weeklyMinute: 0
  });
  assert.equal(nextWeekly.toISOString(), "2026-03-06T21:00:00.000Z");
});

test("StubSummaryProvider is deterministic for identical input", async () => {
  const provider = new StubSummaryProvider();
  const input = {
    cadence: "DAILY" as const,
    timezone: "UTC",
    periodKey: "2026-02-27",
    windowStart: new Date("2026-02-26T16:00:00.000Z"),
    windowEnd: new Date("2026-02-27T16:00:00.000Z"),
    targetLengthMinutes: 5 as const,
    targetWords: 700,
    sources: [
      {
        itemId: "item-2",
        title: "Second item",
        sourceType: "URL" as const,
        sourceUrl: "https://example.com/2",
        createdAt: new Date("2026-02-27T10:00:00.000Z"),
        markdown: "# Header\n\nSecond markdown sample content."
      },
      {
        itemId: "item-1",
        title: "First item",
        sourceType: "PDF" as const,
        sourceUrl: null,
        createdAt: new Date("2026-02-27T11:00:00.000Z"),
        markdown: "# Report\n\nFirst markdown sample content."
      }
    ]
  };

  const first = await provider.summarize(input);
  const second = await provider.summarize(input);

  assert.equal(first.title, second.title);
  assert.equal(first.markdown, second.markdown);
  assert.equal(first.plainText, second.plainText);
});
