import { PrismaClient } from "@prisma/client";
import { workerEnv } from "./env.js";

let prismaClient: PrismaClient | null = null;

export function hasPrismaDatabase(): boolean {
  return Boolean(workerEnv.databaseUrl);
}

function getPrismaClient(): PrismaClient {
  if (!workerEnv.databaseUrl) {
    throw new Error("Prisma database access is not configured for this runtime.");
  }

  if (!prismaClient) {
    process.env.DATABASE_URL = workerEnv.databaseUrl;
    prismaClient = new PrismaClient();

    // Enable WAL journal mode for SQLite to reduce lock contention when the
    // worker and web process share the same database file.
    if (workerEnv.databaseUrl.startsWith("file:")) {
      void prismaClient.$executeRaw`PRAGMA journal_mode=WAL`;
    }
  }

  return prismaClient;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  }
});
