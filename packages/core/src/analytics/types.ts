export const analyticsEventTypes = [
  "USER_SIGNUP",
  "USER_LOGIN",
  "ITEM_SUBMITTED",
  "ITEM_READY",
  "ITEM_FAILED",
  "PLAYBACK_STARTED"
] as const;

export type AnalyticsEventType = (typeof analyticsEventTypes)[number];

export const analyticsSourceTypes = ["URL", "PDF", "HTML_SNAPSHOT"] as const;
export type AnalyticsSourceType = (typeof analyticsSourceTypes)[number];

export const analyticsAuthMethods = ["LOCAL", "OAUTH_LINKED", "GOOGLE", "FACEBOOK", "APPLE"] as const;
export type AnalyticsAuthMethod = (typeof analyticsAuthMethods)[number];

export const analyticsSegmentAuths = ["LOCAL_ONLY", "OAUTH_LINKED"] as const;
export type AnalyticsSegmentAuth = (typeof analyticsSegmentAuths)[number];

export const analyticsUserRoles = ["USER", "ADMIN"] as const;
export type AnalyticsUserRole = (typeof analyticsUserRoles)[number];

export function toAnalyticsDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildAnalyticsSegmentKey(input: {
  sourceType?: AnalyticsSourceType | null;
  authMethod?: AnalyticsAuthMethod | null;
  userRole?: AnalyticsUserRole | null;
}): string {
  const source = input.sourceType || "ALL";
  const auth = input.authMethod || "ALL";
  const role = input.userRole || "ALL";
  return `source:${source}|auth:${auth}|role:${role}`;
}
