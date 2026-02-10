#!/usr/bin/env node
import { execSync } from "node:child_process";

const commands = [
  "node scripts/cost-model/fetch-azure-prices.mjs",
  "node scripts/cost-model/build-cost-workbook.mjs",
  "node scripts/cost-model/build-cost-report.mjs"
];

for (const command of commands) {
  console.log(`> ${command}`);
  execSync(command, { stdio: "inherit" });
}

console.log("Cost model artifacts generated.");
