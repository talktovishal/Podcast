import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const prismaProfileScript = resolve(process.cwd(), "../../scripts/prisma-profile.mjs");

function resolvePrismaSchemaPath(input: {
  profile?: string;
  metadataPrimaryBackend?: string;
  prismaSchemaPath?: string;
}) {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { resolvePrismaSchemaPath } from ${JSON.stringify(prismaProfileScript)};
console.log(resolvePrismaSchemaPath(${JSON.stringify(input)}));`
    ],
    {
      encoding: "utf8"
    }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "resolvePrismaSchemaPath invocation failed");
  }

  return result.stdout.trim();
}

test("azure profile keeps postgres schema by default", () => {
  assert.equal(resolvePrismaSchemaPath({ profile: "azure" }), "apps/web/prisma/schema.postgres.prisma");
});

test("azure profile switches to sqlite schema for azure table primary backend", () => {
  assert.equal(
    resolvePrismaSchemaPath({ profile: "azure", metadataPrimaryBackend: "azure_table" }),
    "apps/web/prisma/schema.prisma"
  );
});

test("parity profile always uses postgres schema", () => {
  assert.equal(resolvePrismaSchemaPath({ profile: "parity", metadataPrimaryBackend: "azure_table" }), "apps/web/prisma/schema.postgres.prisma");
});

test("explicit schema path wins over profile defaults", () => {
  assert.equal(
    resolvePrismaSchemaPath({
      profile: "azure",
      metadataPrimaryBackend: "azure_table",
      prismaSchemaPath: "/tmp/custom.prisma"
    }),
    "/tmp/custom.prisma"
  );
});

test("postgres prisma schema keeps audio retention expiry fields used by parity and azure feeds", () => {
  const sqliteSchema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const postgresSchema = readFileSync(resolve(process.cwd(), "prisma/schema.postgres.prisma"), "utf8");

  for (const modelName of ["Episode", "DigestEpisode", "SummaryEpisode"]) {
    assert.match(sqliteSchema, new RegExp(`model ${modelName} \\{[\\s\\S]*?expiresAt\\s+DateTime\\?`));
    assert.match(postgresSchema, new RegExp(`model ${modelName} \\{[\\s\\S]*?expiresAt\\s+DateTime\\?`));
    assert.match(postgresSchema, new RegExp(`model ${modelName} \\{[\\s\\S]*?@@index\\(\\[expiresAt\\]\\)`));
  }
});

test("postgres prisma schema keeps summary mode fields used by parity and azure fallback", () => {
  const postgresSchema = readFileSync(resolve(process.cwd(), "prisma/schema.postgres.prisma"), "utf8");

  assert.match(postgresSchema, /model User \{[\s\S]*?defaultItemProcessingMode\s+String\s+@default\("FULL_EPISODE"\)/);
  assert.match(postgresSchema, /model Item \{[\s\S]*?processingMode\s+String\s+@default\("FULL_EPISODE"\)/);
  assert.match(postgresSchema, /model Item \{[\s\S]*?summaryStatus\s+String\s+@default\("NOT_REQUESTED"\)/);
  assert.match(postgresSchema, /model Item \{[\s\S]*?summaryStorageKey\s+String\?/);
  assert.match(postgresSchema, /model Item \{[\s\S]*?summaryCompletedAt\s+DateTime\?/);
  assert.match(postgresSchema, /model Item \{[\s\S]*?articleSummaryTask\s+ArticleSummaryTask\?/);
  assert.match(postgresSchema, /model ArticleSummaryTask \{[\s\S]*?itemId\s+String\s+@unique/);
  assert.match(postgresSchema, /model ArticleSummaryTask \{[\s\S]*?@@index\(\[status, scheduledFor\]\)/);
  assert.match(postgresSchema, /model Job \{[\s\S]*?jobKind\s+String\s+@default\("FULL_EPISODE"\)/);
});
