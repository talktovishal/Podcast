export type PaidPlanCode = "PRO_MONTHLY" | "PRO_ANNUAL";

export type PaidPlanConfig = {
  planCode: PaidPlanCode;
  label: string;
  dailyPodcastLimit: number;
  dailySummaryLimit: number;
  weeklySummaryLimit: number;
};

const PAID_PLAN_CONFIGS: Record<PaidPlanCode, PaidPlanConfig> = {
  PRO_MONTHLY: {
    planCode: "PRO_MONTHLY",
    label: "Pro Monthly",
    dailyPodcastLimit: parseNonNegativeInt(process.env.PRO_MONTHLY_DAILY_PODCAST_LIMIT, 12),
    dailySummaryLimit: parseNonNegativeInt(process.env.PRO_MONTHLY_DAILY_SUMMARY_LIMIT, 36),
    weeklySummaryLimit: parseNonNegativeInt(process.env.PRO_MONTHLY_WEEKLY_SUMMARY_LIMIT, 15)
  },
  PRO_ANNUAL: {
    planCode: "PRO_ANNUAL",
    label: "Pro Annual",
    dailyPodcastLimit: parseNonNegativeInt(process.env.PRO_ANNUAL_DAILY_PODCAST_LIMIT, 15),
    dailySummaryLimit: parseNonNegativeInt(process.env.PRO_ANNUAL_DAILY_SUMMARY_LIMIT, 45),
    weeklySummaryLimit: parseNonNegativeInt(process.env.PRO_ANNUAL_WEEKLY_SUMMARY_LIMIT, 30)
  }
};

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

export function paidPlanConfig(planCode: PaidPlanCode): PaidPlanConfig {
  return PAID_PLAN_CONFIGS[planCode];
}

export function paidPlanConfigForAccess(input: { isPaid: boolean; billingPlanCode?: string | null }): PaidPlanConfig | null {
  if (!input.isPaid) {
    return null;
  }

  return input.billingPlanCode === "PRO_MONTHLY" ? PAID_PLAN_CONFIGS.PRO_MONTHLY : PAID_PLAN_CONFIGS.PRO_ANNUAL;
}

export function paidPlanCapacityDelta(): {
  extraDailyPodcasts: number;
  extraWeeklySummaries: number;
} {
  return {
    extraDailyPodcasts: Math.max(0, PAID_PLAN_CONFIGS.PRO_ANNUAL.dailyPodcastLimit - PAID_PLAN_CONFIGS.PRO_MONTHLY.dailyPodcastLimit),
    extraWeeklySummaries: Math.max(0, PAID_PLAN_CONFIGS.PRO_ANNUAL.weeklySummaryLimit - PAID_PLAN_CONFIGS.PRO_MONTHLY.weeklySummaryLimit)
  };
}

export function maxPaidDailyPodcastLimit(): number {
  return Math.max(PAID_PLAN_CONFIGS.PRO_MONTHLY.dailyPodcastLimit, PAID_PLAN_CONFIGS.PRO_ANNUAL.dailyPodcastLimit);
}

export function maxPaidDailySummaryLimit(): number {
  return Math.max(PAID_PLAN_CONFIGS.PRO_MONTHLY.dailySummaryLimit, PAID_PLAN_CONFIGS.PRO_ANNUAL.dailySummaryLimit);
}

export function maxPaidWeeklySummaryLimit(): number {
  return Math.max(PAID_PLAN_CONFIGS.PRO_MONTHLY.weeklySummaryLimit, PAID_PLAN_CONFIGS.PRO_ANNUAL.weeklySummaryLimit);
}
