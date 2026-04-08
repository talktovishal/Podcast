import { z } from "zod";

export const itemStatusValues = ["queued", "processing", "ready", "failed"] as const;
export type ItemStatus = (typeof itemStatusValues)[number];

export const itemPriorityValues = ["LOW", "MEDIUM", "HIGH"] as const;
export type ItemPriority = (typeof itemPriorityValues)[number];
export const itemImportanceValues = itemPriorityValues;
export type ItemImportance = ItemPriority;

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

const itemImportanceSchema = z.enum(itemPriorityValues);
const itemTagsInputSchema = z.union([z.string(), z.array(z.string())]).optional();

function resolveItemImportance(importance?: ItemImportance, priority?: ItemPriority): ItemImportance {
  return importance ?? priority ?? "LOW";
}

export function normalizeItemTags(input: string | ReadonlyArray<string> | null | undefined): string[] {
  const values = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : [];
  const deduped = new Set<string>();

  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (normalized) {
      deduped.add(normalized);
    }
  }

  return Array.from(deduped);
}

export function serializeItemTags(input: string | ReadonlyArray<string> | null | undefined): string {
  return JSON.stringify(normalizeItemTags(input));
}

export function parseStoredItemTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    return normalizeItemTags(input.filter((value): value is string => typeof value === "string"));
  }

  if (typeof input !== "string") {
    return [];
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeItemTags(parsed.filter((value): value is string => typeof value === "string"));
    }
  } catch {
    return normalizeItemTags(trimmed);
  }

  return [];
}

export const submitUrlSchema = z
  .object({
    url: z.string().url(),
    title: z.string().trim().min(1).max(200).optional(),
    importance: itemImportanceSchema.optional(),
    priority: itemImportanceSchema.optional(),
    mode: z.enum(["full", "summary"]).default("full"),
    tags: itemTagsInputSchema
  })
  .transform((input) => ({
    url: input.url,
    title: input.title,
    importance: resolveItemImportance(input.importance, input.priority),
    mode: input.mode,
    tags: normalizeItemTags(input.tags)
  }));

export const submitPdfSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    importance: itemImportanceSchema.optional(),
    priority: itemImportanceSchema.optional(),
    tags: itemTagsInputSchema
  })
  .transform((input) => ({
    title: input.title,
    importance: resolveItemImportance(input.importance, input.priority),
    tags: normalizeItemTags(input.tags)
  }));

export const HTML_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const SNIPPET_SELECTED_TEXT_MAX_CHARS = 20_000;
export const SNIPPET_COMMENT_MAX_CHARS = 2_000;
export const SNIPPET_SELECTED_HTML_MAX_CHARS = 12_000;
export const SNIPPET_CONTEXT_HTML_MAX_CHARS = 24_000;
export const SNIPPET_DERIVED_MARKDOWN_MAX_CHARS = 16_000;

const snippetCommentInputSchema = z.string().max(SNIPPET_COMMENT_MAX_CHARS).nullable().optional();
const snippetSectionHeadingSchema = z.string().trim().min(1).max(200);

function normalizeOptionalSnippetComment(input: string | null | undefined): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalSnippetField(input: string | null | undefined): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  const trimmed = input.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeSnippetSectionHeadings(input: ReadonlyArray<string> | null | undefined): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const deduped = new Set<string>();
  for (const value of input) {
    const normalized = normalizeOptionalSnippetField(value);
    if (normalized) {
      deduped.add(normalized);
    }
  }

  return Array.from(deduped);
}

export const snippetPageMetadataSchema = z
  .object({
    canonicalUrl: z.string().url().max(2048).optional(),
    siteName: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(1500).optional(),
    author: z.string().trim().min(1).max(200).optional(),
    byline: z.string().trim().min(1).max(400).optional(),
    publishedAt: z.string().trim().min(1).max(120).optional(),
    language: z.string().trim().min(1).max(40).optional(),
    imageUrl: z.string().url().max(2048).optional(),
    sectionHeadings: z.array(snippetSectionHeadingSchema).max(6).optional()
  })
  .transform((input) => {
    const normalized: {
      canonicalUrl?: string;
      siteName?: string;
      description?: string;
      author?: string;
      byline?: string;
      publishedAt?: string;
      language?: string;
      imageUrl?: string;
      sectionHeadings: string[];
    } = {
      sectionHeadings: normalizeSnippetSectionHeadings(input.sectionHeadings)
    };

    const canonicalUrl = normalizeOptionalSnippetField(input.canonicalUrl);
    const siteName = normalizeOptionalSnippetField(input.siteName);
    const description = normalizeOptionalSnippetField(input.description);
    const author = normalizeOptionalSnippetField(input.author);
    const byline = normalizeOptionalSnippetField(input.byline);
    const publishedAt = normalizeOptionalSnippetField(input.publishedAt);
    const language = normalizeOptionalSnippetField(input.language);
    const imageUrl = normalizeOptionalSnippetField(input.imageUrl);

    if (canonicalUrl) {
      normalized.canonicalUrl = canonicalUrl;
    }
    if (siteName) {
      normalized.siteName = siteName;
    }
    if (description) {
      normalized.description = description;
    }
    if (author) {
      normalized.author = author;
    }
    if (byline) {
      normalized.byline = byline;
    }
    if (publishedAt) {
      normalized.publishedAt = publishedAt;
    }
    if (language) {
      normalized.language = language;
    }
    if (imageUrl) {
      normalized.imageUrl = imageUrl;
    }

    return normalized;
  });

export const submitHtmlSnapshotSchema = z
  .object({
    url: z.string().url().max(2048),
    title: z.string().trim().min(1).max(200).optional(),
    html: z.string().trim().min(1),
    capturedAt: z.string().datetime().optional(),
    importance: itemImportanceSchema.optional(),
    priority: itemImportanceSchema.optional(),
    tags: itemTagsInputSchema
  })
  .transform((input) => ({
    url: input.url,
    title: input.title,
    html: input.html,
    capturedAt: input.capturedAt,
    importance: resolveItemImportance(input.importance, input.priority),
    tags: normalizeItemTags(input.tags)
  }));

export const createSnippetSchema = z
  .object({
    sourceUrl: z.string().url().max(2048),
    sourceTitle: z.string().trim().min(1).max(200).optional(),
    selectedText: z.string().trim().min(1).max(SNIPPET_SELECTED_TEXT_MAX_CHARS),
    comment: snippetCommentInputSchema,
    selectedHtml: z.string().trim().min(1).max(SNIPPET_SELECTED_HTML_MAX_CHARS).optional(),
    contextHtml: z.string().trim().min(1).max(SNIPPET_CONTEXT_HTML_MAX_CHARS).optional(),
    pageMetadata: snippetPageMetadataSchema.optional()
  })
  .transform((input) => ({
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    selectedText: input.selectedText.trim(),
    comment: normalizeOptionalSnippetComment(input.comment),
    selectedHtml: normalizeOptionalSnippetField(input.selectedHtml),
    contextHtml: normalizeOptionalSnippetField(input.contextHtml),
    pageMetadata: input.pageMetadata
  }));

export const updateSnippetSchema = z
  .object({
    comment: snippetCommentInputSchema
  })
  .refine((input) => input.comment !== undefined, {
    message: "At least one snippet field must be provided."
  })
  .transform((input) => ({
    comment: input.comment === undefined ? undefined : normalizeOptionalSnippetComment(input.comment)
  }));

export const updateItemMetadataSchema = z
  .object({
    importance: itemImportanceSchema.optional(),
    priority: itemImportanceSchema.optional(),
    tags: itemTagsInputSchema
  })
  .refine((input) => input.importance !== undefined || input.priority !== undefined || input.tags !== undefined, {
    message: "At least one metadata field must be provided."
  })
  .transform((input) => ({
    importance: input.importance === undefined && input.priority === undefined ? undefined : resolveItemImportance(input.importance, input.priority),
    tags: input.tags === undefined ? undefined : normalizeItemTags(input.tags)
  }));

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
export type CreateSnippetInput = z.infer<typeof createSnippetSchema>;
export type UpdateSnippetInput = z.infer<typeof updateSnippetSchema>;
export type SnippetPageMetadata = z.infer<typeof snippetPageMetadataSchema>;
export type UpdateItemMetadataInput = z.infer<typeof updateItemMetadataSchema>;
export type ExtensionConnectCodeInput = z.infer<typeof extensionConnectCodeSchema>;
export type ExtensionTokenExchangeInput = z.infer<typeof extensionTokenExchangeSchema>;
export type UpdateTtsSettingsInput = z.infer<typeof updateTtsSettingsSchema>;
export type PreviewTtsInput = z.infer<typeof previewTtsSchema>;
export type UpdateDigestSettingsInput = z.infer<typeof updateDigestSettingsSchema>;
export type DigestSchedulerTickInput = z.infer<typeof digestSchedulerTickSchema>;
export type CreateSummaryRunInput = z.infer<typeof createSummaryRunSchema>;
