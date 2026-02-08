import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const dbPath = resolve(process.cwd(), ".data/db.sqlite");

const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT,
  "name" TEXT,
  "role" TEXT NOT NULL DEFAULT 'USER',
  "ttsProvider" TEXT NOT NULL DEFAULT 'kokoro',
  "ttsVoice" TEXT NOT NULL DEFAULT 'af_heart',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "FeedToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenValue" TEXT NOT NULL UNIQUE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "active" BOOLEAN NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotatedAt" DATETIME,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "FeedToken_userId_active_idx" ON "FeedToken" ("userId", "active");

CREATE TABLE IF NOT EXISTS "ShareToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenValue" TEXT NOT NULL UNIQUE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "scope" TEXT NOT NULL DEFAULT 'read_only',
  "expiresAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Item" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "sourceFilePath" TEXT,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "textHash" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "Item_userId_status_idx" ON "Item" ("userId", "status");

CREATE TABLE IF NOT EXISTS "Episode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL UNIQUE,
  "guid" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "audioPath" TEXT NOT NULL,
  "audioBytes" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "Episode_publishedAt_idx" ON "Episode" ("publishedAt");

CREATE TABLE IF NOT EXISTS "Job" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "lockedAt" DATETIME,
  "nextRetryAt" DATETIME,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "Job_status_createdAt_idx" ON "Job" ("status", "createdAt");

CREATE TABLE IF NOT EXISTS "JobEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payloadJson" JSON NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "JobEvent_jobId_createdAt_idx" ON "JobEvent" ("jobId", "createdAt");

CREATE TABLE IF NOT EXISTS "ChunkCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "hash" TEXT NOT NULL UNIQUE,
  "filePath" TEXT NOT NULL,
  "audioBytes" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ChunkCache_itemId_idx" ON "ChunkCache" ("itemId");
`;

function resolveSqliteBinary(): string {
  const candidates = [
    process.env.SQLITE3_BIN,
    "/usr/bin/sqlite3",
    "/opt/homebrew/bin/sqlite3",
    "/Users/vishalchowdhary/Library/Android/sdk/platform-tools/sqlite3",
    "sqlite3"
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-version"], { stdio: "ignore" });
    if (probe.status === 0) {
      return candidate;
    }
  }

  throw new Error("sqlite3 binary not found. Set SQLITE3_BIN to a valid sqlite3 path.");
}

function runSql(sqliteBin: string, dbPathInput: string, sql: string): string {
  const result = spawnSync(sqliteBin, [dbPathInput, sql], {
    encoding: "utf-8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `sqlite command failed for SQL: ${sql}`);
  }
  return result.stdout ?? "";
}

function ensureUserColumns(sqliteBin: string): void {
  const tableInfo = runSql(sqliteBin, dbPath, `PRAGMA table_info("User");`)
    .trim()
    .split("\n")
    .filter(Boolean);
  const existingColumns = new Set(tableInfo.map((line) => line.split("|")[1]).filter(Boolean));

  const requiredColumns: Array<{ name: string; sqlType: string }> = [
    { name: "ttsProvider", sqlType: `TEXT NOT NULL DEFAULT 'kokoro'` },
    { name: "ttsVoice", sqlType: `TEXT NOT NULL DEFAULT 'af_heart'` }
  ];

  for (const column of requiredColumns) {
    if (existingColumns.has(column.name)) {
      continue;
    }
    runSql(sqliteBin, dbPath, `ALTER TABLE "User" ADD COLUMN "${column.name}" ${column.sqlType};`);
  }
}

async function main() {
  await mkdir(dirname(dbPath), { recursive: true });
  const sqlPath = resolve(process.cwd(), ".data/bootstrap.sql");
  await writeFile(sqlPath, schemaSql, "utf-8");

  const sqliteBin = resolveSqliteBinary();
  const result = spawnSync(sqliteBin, [dbPath, `.read ${sqlPath}`], {
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error("Failed to apply SQLite bootstrap schema");
  }

  ensureUserColumns(sqliteBin);
  await access(dbPath, constants.F_OK);
  // eslint-disable-next-line no-console
  console.log(`DB bootstrap complete: ${dbPath}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
