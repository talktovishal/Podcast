import { z } from "zod";
import {
  analyticsAuthMethods,
  analyticsSourceTypes,
  analyticsUserRoles
} from "@articlepod/core";
import type { AdminAnalyticsDatePreset, AdminAnalyticsFilters } from "./types";

const presetValues = ["7d", "30d", "90d", "custom"] as const satisfies ReadonlyArray<AdminAnalyticsDatePreset>;
const sourceValues = ["ALL", ...analyticsSourceTypes] as const;
const authValues = ["ALL", ...analyticsAuthMethods] as const;
const roleValues = ["ALL", ...analyticsUserRoles] as const;

const querySchema = z.object({
  preset: z.enum(presetValues).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  source: z.enum(sourceValues).optional(),
  auth: z.enum(authValues).optional(),
  role: z.enum(roleValues).optional()
});

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function resolveDefaultRange(preset: AdminAnalyticsDatePreset): { from: Date; to: Date } {
  const today = new Date();
  const to = endOfUtcDay(today);
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const from = startOfUtcDay(addDays(to, -(days - 1)));
  return { from, to };
}

export function parseAdminAnalyticsFilters(searchParams: URLSearchParams): AdminAnalyticsFilters {
  const parsed = querySchema.parse({
    preset: searchParams.get("preset") || undefined,
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
    source: searchParams.get("source") || undefined,
    auth: searchParams.get("auth") || undefined,
    role: searchParams.get("role") || undefined
  });

  const preset: AdminAnalyticsDatePreset = parsed.preset ?? "30d";
  let range = resolveDefaultRange(preset);

  if (parsed.from && parsed.to) {
    const from = new Date(parsed.from);
    const to = new Date(parsed.to);
    if (Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && from.getTime() <= to.getTime()) {
      range = { from, to };
    }
  }

  return {
    from: range.from,
    to: range.to,
    preset,
    source: parsed.source ?? "ALL",
    auth: parsed.auth ?? "ALL",
    role: parsed.role ?? "ALL"
  };
}

export function parsePagination(searchParams: URLSearchParams): { page: number; pageSize: number; pii: boolean } {
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSizeRaw = Number(searchParams.get("page_size") ?? "25") || 25;
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw));
  const pii = searchParams.get("pii") === "1";
  return { page, pageSize, pii };
}
