import assert from "node:assert/strict";
import test from "node:test";
import { resolveGeoSnapshotFromHeaders } from "../src/lib/geo";

test("geo resolver prefers vercel headers over cloudflare headers", () => {
  const geo = resolveGeoSnapshotFromHeaders(
    new Headers({
      "x-vercel-ip-country": "us",
      "cf-ipcountry": "DE",
      "x-vercel-ip-country-region": "ca",
      "cf-region-code": "BE",
      "x-vercel-ip-city": "San Francisco",
      "cf-ipcity": "Berlin"
    })
  );

  assert.equal(geo.countryCode, "US");
  assert.equal(geo.regionCode, "CA");
  assert.equal(geo.city, "San Francisco");
});

test("geo resolver falls back to cloudflare headers and normalizes values", () => {
  const geo = resolveGeoSnapshotFromHeaders(
    new Headers({
      "cf-ipcountry": "ca",
      "cf-region-code": " on ",
      "cf-ipcity": "  Toronto  "
    })
  );

  assert.equal(geo.countryCode, "CA");
  assert.equal(geo.regionCode, "ON");
  assert.equal(geo.city, "Toronto");
});

test("geo resolver rejects invalid country/region values and accepts international city names", () => {
  const geo = resolveGeoSnapshotFromHeaders(
    new Headers({
      "x-vercel-ip-country": "123",
      "x-vercel-ip-country-region": "north@",
      "x-vercel-ip-city": "Sao Paulo"
    })
  );

  assert.equal(geo.countryCode, null);
  assert.equal(geo.regionCode, null);
  assert.equal(geo.city, "Sao Paulo");
});
