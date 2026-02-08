import { z } from "zod";

export const itemStatusValues = ["queued", "processing", "ready", "failed"] as const;
export type ItemStatus = (typeof itemStatusValues)[number];

export const jobStatusValues = ["queued", "processing", "succeeded", "failed"] as const;
export type JobStatus = (typeof jobStatusValues)[number];

export const sourceTypeValues = ["url", "pdf", "html_snapshot"] as const;
export type SourceType = (typeof sourceTypeValues)[number];

export const userRoleValues = ["user", "admin"] as const;
export type UserRole = (typeof userRoleValues)[number];

export const episodeFormatValues = ["audio/mpeg", "audio/mp4"] as const;
export type EpisodeFormat = (typeof episodeFormatValues)[number];

export const submitUrlSchema = z.object({
  url: z.string().url(),
  title: z.string().trim().min(1).max(200).optional(),
  mode: z.enum(["full", "summary"]).default("full")
});

export const submitPdfSchema = z.object({
  title: z.string().trim().min(1).max(200).optional()
});

export const submitHtmlSnapshotSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().trim().min(1).max(200).optional(),
  html: z.string().trim().min(1).max(2_000_000),
  capturedAt: z.string().datetime().optional()
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

export const previewTtsSchema = z.object({
  providerId: z.string().trim().min(1).max(40).optional(),
  voice: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(400).optional()
});

export type SubmitUrlInput = z.infer<typeof submitUrlSchema>;
export type SubmitPdfInput = z.infer<typeof submitPdfSchema>;
export type SubmitHtmlSnapshotInput = z.infer<typeof submitHtmlSnapshotSchema>;
export type ExtensionConnectCodeInput = z.infer<typeof extensionConnectCodeSchema>;
export type ExtensionTokenExchangeInput = z.infer<typeof extensionTokenExchangeSchema>;
export type UpdateTtsSettingsInput = z.infer<typeof updateTtsSettingsSchema>;
export type PreviewTtsInput = z.infer<typeof previewTtsSchema>;
