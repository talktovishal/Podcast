import { PrismaClient } from "@prisma/client";
import { env } from "./env";

declare global {
  var __prisma__: PrismaClient | undefined;
}

process.env.DATABASE_URL = env.databaseUrl;

export const prisma = global.__prisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma__ = prisma;
}

// Enable WAL journal mode for SQLite to reduce lock contention between the
// Next.js web process and the worker process sharing the same database file.
if (env.databaseUrl.startsWith("file:")) {
  void prisma.$executeRaw`PRAGMA journal_mode=WAL`;
}
