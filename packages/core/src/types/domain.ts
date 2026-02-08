import { z } from "zod";

export const itemStatusValues = ["queued", "processing", "ready", "failed"] as const;
export type ItemStatus = (typeof itemStatusValues)[number];

export const jobStatusValues = ["queued", "processing", "succeeded", "failed"] as const;
export type JobStatus = (typeof jobStatusValues)[number];

export const sourceTypeValues = ["url", "pdf"] as const;
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

export const rotateFeedTokenSchema = z.object({
  reason: z.string().trim().max(200).optional()
});

export type SubmitUrlInput = z.infer<typeof submitUrlSchema>;
export type SubmitPdfInput = z.infer<typeof submitPdfSchema>;
