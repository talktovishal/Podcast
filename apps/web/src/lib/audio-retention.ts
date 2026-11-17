import { episodeAudioExpiryDate, isExpiredAt } from "@articlepod/core";
import { env } from "./env";

export function buildAudioExpiryDate(publishedAt: Date): Date {
  return episodeAudioExpiryDate(publishedAt, env.audioRetentionDays);
}

export function isAudioExpired(expiresAt: Date | null | undefined, now = new Date()): boolean {
  return isExpiredAt(expiresAt, now);
}

export function isAudioAvailable(expiresAt: Date | null | undefined, now = new Date()): boolean {
  return !isAudioExpired(expiresAt, now);
}

export function filterUnexpiredAudioEpisodes<T extends { expiresAt: Date | null | undefined }>(
  episodes: readonly T[],
  now = new Date()
): T[] {
  return episodes.filter((episode) => isAudioAvailable(episode.expiresAt, now));
}
