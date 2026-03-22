import { z } from "zod";

export const itemStatusValues = ["queued", "processing", "ready", "failed"] as const;
export type ItemStatus = (typeof itemStatusValues)[number];

export const itemPriorityValues = ["LOW", "MEDIUM", "HIGH"] as const;
export type ItemPriority = (typeof itemPriorityValues)[number];

export const jobStatusValues = ["queued", "processing", "succeeded", "failed"] as const;
export type JobStatus = (typeof jobStatusValues)[number];

export const sourceTypeValues = ["url", "pdf", "html_snapshot"] as const;
export type SourceType = (typeof sourceTypeValues)[number];

export const userRoleValues = ["user", "admin"] as const;
export type UserRole = (typeof userRoleValues)[number];

export const episodeFormatValues = ["audio/mpeg", "audio/mp4"] as const;
export type EpisodeFormat = (typeof episodeFormatValues)[number];

export const digestCadenceValues = ["DAILY", "WEEKLY"] as const;
export type DigestCadence = (typeof digestCadenceValues)[number];

export const digestLengthMinutesValues = [5, 15, 30] as const;
export type DigestLengthMinutes = (typeof digestLengthMinutesValues)[number];

export const digestRunStatusValues = ["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED", "SKIPPED"] as const;
export type DigestRunStatus = (typeof digestRunStatusValues)[number];

export const digestEmailStatusValues = ["STUB_STORED", "SENT", "FAILED", "SKIPPED"] as const;
export type DigestEmailStatus = (typeof digestEmailStatusValues)[number];

export const digestPodcastStatusValues = ["SUCCEEDED", "FAILED", "SKIPPED"] as const;
export type DigestPodcastStatus = (typeof digestPodcastStatusValues)[number];

export const summaryRunStatusValues = ["QUEUED", "PROCESSING", "SUCCEEDED", "FAILED", "SKIPPED"] as const;
export type SummaryRunStatus = (typeof summaryRunStatusValues)[number];

export const summaryPodcastStatusValues = ["SUCCEEDED", "FAILED", "SKIPPED"] as const;
export type SummaryPodcastStatus = (typeof summaryPodcastStatusValues)[number];

export const digestDayOfWeekValues = [0, 1, 2, 3, 4, 5, 6] as const;
export type DigestDayOfWeek = (typeof digestDayOfWeekValues)[number];

export const submitUrlSchema = z.object({
  url: z.string().url(),
  title: z.string().trim().min(1).max(200).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  mode: z.enum(["full", "summary"]).default("full")
});

export const submitPdfSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW")
});

export const submitHtmlSnapshotSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().trim().min(1).max(200).optional(),
  html: z.string().trim().min(1).max(2_000_000),
  capturedAt: z.string().datetime().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW")
});

export const extensionConnectCodeSchema = z.object({
  label: z.string().trim().min(1).max(80).optional()
});

export const extensionTokenExchangeSchema = z.object({
  connectCode: z.string().trim().min(10).max(256),
  label: z.string().trim().min(1).max(80).optional()
});

export const rotateFeedTokenSchema = z.object({
  reason: z.string().trim().max(200).optional()
});

export const updateTtsSettingsSchema = z.object({
  providerId: z.string().trim().min(1).max(40).optional(),
  voice: z.string().trim().min(1).max(80)
});

function isValidIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const digestLengthSchema = z.union([z.literal(5), z.literal(15), z.literal(30)]);

export const updateDigestSettingsSchema = z.object({
  timezone: z.string().trim().min(1).max(80).refine((value) => isValidIanaTimezone(value), "Invalid IANA timezone."),
  dailyEmailEnabled: z.boolean(),
  dailyPodcastEnabled: z.boolean(),
  dailyHour: z.number().int().min(0).max(23),
  dailyMinute: z.number().int().min(0).max(59),
  dailyLengthMinutes: digestLengthSchema,
  weeklyEmailEnabled: z.boolean(),
  weeklyPodcastEnabled: z.boolean(),
  weeklyDayOfWeek: z.number().int().min(0).max(6),
  weeklyHour: z.number().int().min(0).max(23),
  weeklyMinute: z.number().int().min(0).max(59),
  weeklyLengthMinutes: digestLengthSchema
});

export const digestSchedulerTickSchema = z.object({
  forceNow: z.boolean().optional().default(false),
  requestedBy: z.string().trim().max(80).optional()
});

export const createSummaryRunSchema = z.object({
  itemIds: z.array(z.string().trim().min(1)).min(1).max(30),
  requestedTitle: z.string().trim().max(200).optional(),
  targetLengthMinutes: digestLengthSchema.default(15),
  podcastEnabled: z.boolean().optional().default(true)
});

export const previewTtsSchema = z.object({
  providerId: z.string().trim().min(1).max(40).optional(),
  voice: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(400).optional()
});

export function digestTargetWords(minutes: DigestLengthMinutes): number {
  switch (minutes) {
    case 5:
      return 700;
    case 15:
      return 2_100;
    case 30:
      return 4_200;
    default:
      return 2_100;
  }
}

export type SubmitUrlInput = z.infer<typeof submitUrlSchema>;
export type SubmitPdfInput = z.infer<typeof submitPdfSchema>;
export type SubmitHtmlSnapshotInput = z.infer<typeof submitHtmlSnapshotSchema>;
export type ExtensionConnectCodeInput = z.infer<typeof extensionConnectCodeSchema>;
export type ExtensionTokenExchangeInput = z.infer<typeof extensionTokenExchangeSchema>;
export type UpdateTtsSettingsInput = z.infer<typeof updateTtsSettingsSchema>;
export type PreviewTtsInput = z.infer<typeof previewTtsSchema>;
export type UpdateDigestSettingsInput = z.infer<typeof updateDigestSettingsSchema>;
export type DigestSchedulerTickInput = z.infer<typeof digestSchedulerTickSchema>;
export type CreateSummaryRunInput = z.infer<typeof createSummaryRunSchema>;
