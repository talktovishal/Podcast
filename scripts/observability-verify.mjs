#!/usr/bin/env node
import { execSync } from "node:child_process";

const commands = [
  "corepack pnpm --filter @listenlater/core test -- logging",
  "corepack pnpm --filter @listenlater/web test -- observability",
  "corepack pnpm --filter @listenlater/worker test -- queue",
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
