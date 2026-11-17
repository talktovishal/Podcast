export const DEFAULT_AUDIO_RETENTION_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export function episodeAudioExpiryDate(publishedAt: Date, retentionDays = DEFAULT_AUDIO_RETENTION_DAYS): Date {
  return new Date(publishedAt.getTime() + retentionDays * DAY_MS);
}

export function isExpiredAt(expiresAt: Date | null | undefined, now = new Date()): boolean {
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
}
