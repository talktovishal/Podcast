import { env } from "./env";

export type GeoSnapshot = {
  countryCode: string | null;
  regionCode: string | null;
  city: string | null;
};

const DEFAULT_COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry"] as const;
const DEFAULT_REGION_HEADERS = ["x-vercel-ip-country-region", "cf-region-code"] as const;
const DEFAULT_CITY_HEADERS = ["x-vercel-ip-city", "cf-ipcity"] as const;

function uniqueHeaderNames(overrideName: string | undefined, defaults: readonly string[]): string[] {
  const names: string[] = [];
  if (overrideName?.trim()) {
    names.push(overrideName.trim().toLowerCase());
  }
  for (const name of defaults) {
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

function firstHeaderValue(headers: Headers, names: readonly string[]): string | null {
  for (const name of names) {
    const value = headers.get(name);
    if (!value) {
      continue;
    }
    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function normalizeCountryCode(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return null;
  }
  if (normalized === "XX" || normalized === "T1") {
    return null;
  }
  return normalized;
}

function normalizeRegionCode(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const collapsed = value
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (!collapsed) {
    return null;
  }
  if (collapsed.length > 64) {
    return null;
  }
  if (!/^[A-Z0-9 _.-]+$/.test(collapsed)) {
    return null;
  }
  return collapsed;
}

function normalizeCity(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const collapsed = value
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ");
  if (!collapsed) {
    return null;
  }
  if (collapsed.length > 120) {
    return collapsed.slice(0, 120).trim() || null;
  }
  return collapsed;
}

export function resolveGeoSnapshotFromHeaders(headers: Headers): GeoSnapshot {
  const countryHeaderNames = uniqueHeaderNames(env.geoHeaderCountry, DEFAULT_COUNTRY_HEADERS);
  const regionHeaderNames = uniqueHeaderNames(env.geoHeaderRegion, DEFAULT_REGION_HEADERS);
  const cityHeaderNames = uniqueHeaderNames(env.geoHeaderCity, DEFAULT_CITY_HEADERS);

  const countryRaw = firstHeaderValue(headers, countryHeaderNames);
  const regionRaw = firstHeaderValue(headers, regionHeaderNames);
  const cityRaw = firstHeaderValue(headers, cityHeaderNames);

  return {
    countryCode: normalizeCountryCode(countryRaw),
    regionCode: normalizeRegionCode(regionRaw),
    city: normalizeCity(cityRaw)
  };
}
