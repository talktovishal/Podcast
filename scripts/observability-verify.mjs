#!/usr/bin/env node
import { execSync } from "node:child_process";

const commands = [
  "corepack pnpm --filter @articlepod/core exec tsx --test tests/logging.test.ts",
  "corepack pnpm --filter @articlepod/web run test:observability",
  "corepack pnpm --filter @articlepod/worker run test:observability",
];

for (const cmd of commands) {
  try {
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: "inherit" });
  } catch (error) {
    console.error(`failed: ${cmd}`);
    process.exit(1);
  }
}

console.log("observability verification passed");
