import assert from "node:assert/strict";
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
