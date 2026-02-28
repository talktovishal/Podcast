import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { updateUserGeoSnapshotFromRequest } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

let dbReady = false;

function ensureDbBootstrap(): void {
  if (dbReady || process.env.ARTICLEPOD_TEST_DB_READY === "1") {
    dbReady = true;
    return;
  }

  const here = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = resolve(here, "../../..");
  const result = spawnSync("npx", ["pnpm", "--filter", "@articlepod/web", "run", "db:bootstrap"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "db bootstrap failed");
  }

  dbReady = true;
}

test("geo snapshot stores first-seen once and updates last-seen on later logins", async () => {
  ensureDbBootstrap();
  const uniq = Date.now().toString(36);

  const user = await prisma.user.create({
    data: {
      email: `geo-${uniq}@articlepod.local`,
      role: "USER"
    }
  });

  try {
    const firstRequest = new NextRequest("http://localhost/login", {
      headers: {
        "x-vercel-ip-country": "US",
        "x-vercel-ip-country-region": "CA",
        "x-vercel-ip-city": "San Francisco"
      }
    });

    await updateUserGeoSnapshotFromRequest(user.id, firstRequest);

    const afterFirst = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(afterFirst.firstSeenCountryCode, "US");
    assert.equal(afterFirst.firstSeenRegionCode, "CA");
    assert.equal(afterFirst.firstSeenCity, "San Francisco");
    assert.equal(afterFirst.lastSeenCountryCode, "US");
    assert.equal(afterFirst.lastSeenRegionCode, "CA");
    assert.equal(afterFirst.lastSeenCity, "San Francisco");
    assert.ok(afterFirst.firstSeenAt instanceof Date);
    assert.ok(afterFirst.lastSeenAt instanceof Date);

    const firstSeenAt = afterFirst.firstSeenAt;
    const firstSeenCountryCode = afterFirst.firstSeenCountryCode;
    const firstSeenRegionCode = afterFirst.firstSeenRegionCode;
    const firstSeenCity = afterFirst.firstSeenCity;
    const previousLastSeenAt = afterFirst.lastSeenAt;

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));

    const secondRequest = new NextRequest("http://localhost/login", {
      headers: {
        "cf-ipcountry": "DE",
        "cf-region-code": "BE",
        "cf-ipcity": "Berlin"
      }
    });
    await updateUserGeoSnapshotFromRequest(user.id, secondRequest);

    const afterSecond = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(afterSecond.firstSeenAt?.toISOString(), firstSeenAt?.toISOString());
    assert.equal(afterSecond.firstSeenCountryCode, firstSeenCountryCode);
    assert.equal(afterSecond.firstSeenRegionCode, firstSeenRegionCode);
    assert.equal(afterSecond.firstSeenCity, firstSeenCity);
    assert.equal(afterSecond.lastSeenCountryCode, "DE");
    assert.equal(afterSecond.lastSeenRegionCode, "BE");
    assert.equal(afterSecond.lastSeenCity, "Berlin");
    assert.ok((afterSecond.lastSeenAt?.getTime() ?? 0) >= (previousLastSeenAt?.getTime() ?? 0));

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));

    const noGeoRequest = new NextRequest("http://localhost/login");
    await updateUserGeoSnapshotFromRequest(user.id, noGeoRequest);
    const afterThird = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(afterThird.lastSeenCountryCode, "DE");
    assert.equal(afterThird.lastSeenRegionCode, "BE");
    assert.equal(afterThird.lastSeenCity, "Berlin");
    assert.ok((afterThird.lastSeenAt?.getTime() ?? 0) >= (afterSecond.lastSeenAt?.getTime() ?? 0));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
