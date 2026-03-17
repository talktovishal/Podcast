import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import type { DatabaseSnapshotModelConfig } from "../src/lib/ops/database-snapshot";
import { databaseSnapshotModelConfigs } from "../src/lib/ops/database-snapshot";

type ExportBundle = {
  formatVersion: number;
  exportedAt: string;
  sourceDatabaseUrl: string;
  counts: Record<string, number>;
  data: Record<string, Array<Record<string, unknown>>>;
};

function parseArgs(): { inFile: string; truncate: boolean } {
  const args = process.argv.slice(2);
  let inFile = "./.data/db-export.json";
  let truncate = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--in") {
      inFile = args[i + 1] ?? inFile;
      i += 1;
      continue;
    }
    if (arg === "--truncate") {
      truncate = true;
    }
  }

  return { inFile: resolve(process.cwd(), inFile), truncate };
}

function toDate(value: unknown): Date | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === "string" && value.length > 0) {
    return new Date(value);
  }
  if (value instanceof Date) {
    return value;
  }
  return undefined;
}

function castJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function castNullableJson(value: unknown): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return value === null ? Prisma.DbNull : castJson(value);
}

function hydrateRow(config: DatabaseSnapshotModelConfig, row: Record<string, unknown>) {
  const hydrated: Record<string, unknown> = { ...row };

  for (const field of config.dateFields) {
    hydrated[field] = toDate(row[field]);
  }

  for (const field of config.jsonFields ?? []) {
    if (Object.prototype.hasOwnProperty.call(row, field) && row[field] !== undefined) {
      hydrated[field] = castJson(row[field]);
    }
  }

  for (const field of config.nullableJsonFields ?? []) {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      hydrated[field] = castNullableJson(row[field]);
    }
  }

  return hydrated;
}

async function maybeTruncateAll(): Promise<void> {
  for (const config of [...databaseSnapshotModelConfigs].reverse()) {
    const delegate = (prisma as Record<string, any>)[config.delegate];
    await delegate.deleteMany();
  }
}

async function main() {
  const { inFile, truncate } = parseArgs();
  const parsed = JSON.parse(await readFile(inFile, "utf8")) as ExportBundle;

  if (parsed.formatVersion !== 1) {
    throw new Error(`Unsupported export format version '${parsed.formatVersion}'.`);
  }

  if (truncate) {
    await maybeTruncateAll();
  }

  for (const config of databaseSnapshotModelConfigs) {
    const rows = parsed.data[config.exportKey] ?? [];
    if (rows.length === 0) {
      continue;
    }

    const delegate = (prisma as Record<string, any>)[config.delegate];
    await delegate.createMany({
      data: rows.map((row) => hydrateRow(config, row))
    });
  }

  // eslint-disable-next-line no-console
  console.log(`[db:import-json] imported from ${inFile}`);
  // eslint-disable-next-line no-console
  console.log(`[db:import-json] source snapshot date ${parsed.exportedAt}`);
  // eslint-disable-next-line no-console
  console.log(`[db:import-json] source counts ${JSON.stringify(parsed.counts)}`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
