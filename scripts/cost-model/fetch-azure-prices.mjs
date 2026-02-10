#!/usr/bin/env node
import { resolve } from "node:path";
import { fetchAzurePriceSnapshot, savePriceSnapshot } from "./model-lib.mjs";

const repoRoot = resolve(process.cwd());
const cachePath = resolve(repoRoot, "exports/costs/azure-prices.snapshot.json");

async function main() {
  const snapshot = await fetchAzurePriceSnapshot();
  await savePriceSnapshot(cachePath, snapshot);
  console.log(`Saved Azure price snapshot: ${cachePath}`);
  console.log(`Generated at: ${snapshot.generatedAt}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
