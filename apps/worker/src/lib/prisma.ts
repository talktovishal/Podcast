import { PrismaClient } from "@prisma/client";
import { workerEnv } from "./env.js";

process.env.DATABASE_URL = workerEnv.databaseUrl;

export const prisma = new PrismaClient();

// Enable WAL journal mode for SQLite to reduce lock contention when the
// worker and web process share the same database file.
if (workerEnv.databaseUrl.startsWith("file:")) {
  void prisma.$executeRaw`PRAGMA journal_mode=WAL`;
}
