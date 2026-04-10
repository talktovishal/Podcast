import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { azureTablePrimaryBackfillModelNames } from "../src/lib/ops/azure-table-primary-backfill";
import { databaseSnapshotModelNames } from "../src/lib/ops/database-snapshot";

function readSchemaModelNames() {
  const schemaPath = resolve(process.cwd(), "prisma/schema.prisma");
  const source = readFileSync(schemaPath, "utf8");
  return [...source.matchAll(/^model\s+(\w+)\s+\{/gm)].map((match) => match[1]);
}

test("database snapshot coverage stays aligned with Prisma schema models", () => {
  const schemaModels = readSchemaModelNames().sort();
  const coveredModels = [...databaseSnapshotModelNames].sort();

  assert.deepEqual(coveredModels, schemaModels);
});

test("azure table primary backfill covers the operational metadata model set", () => {
  const expectedModels = [
    "BillingWebhookEvent",
    "ChunkCache",
    "DigestEpisode",
    "DigestFeedToken",
    "DigestRun",
    "DigestSchedulerTick",
    "Episode",
    "ExtensionConnectCode",
    "ExtensionToken",
    "FeedToken",
    "Item",
    "ItemArtifact",
    "Job",
    "OAuthIdentity",
    "SandboxBillingAccount",
    "Session",
    "ShareToken",
    "Snippet",
    "SummaryEpisode",
    "SummaryRun",
    "SummaryRunItem",
    "User",
    "UserFeedback",
    "UserDemographicSurvey",
    "UserDigestSettings"
  ].sort();

  assert.deepEqual([...azureTablePrimaryBackfillModelNames].sort(), expectedModels);
});
