import { PrismaClient } from "@prisma/client";
import { env } from "./env";

declare global {
  var __prisma__: PrismaClient | undefined;
}

export function hasPrismaDatabase(): boolean {
  return Boolean(env.databaseUrl);
}

function createPrismaClient(): PrismaClient {
  if (!env.databaseUrl) {
    throw new Error("Prisma database access is not configured for this runtime.");
  }

  process.env.DATABASE_URL = env.databaseUrl;
  const client = new PrismaClient();

  // Enable WAL journal mode for SQLite to reduce lock contention between the
  // Next.js web process and the worker process sharing the same database file.
  if (env.databaseUrl.startsWith("file:")) {
    void client.$executeRaw`PRAGMA journal_mode=WAL`;
  }

  return client;
}

function getPrismaClient(): PrismaClient {
  if (!hasPrismaDatabase()) {
    throw new Error("Prisma database access is not configured for this runtime.");
  }

  if (global.__prisma__) {
    return global.__prisma__;
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    global.__prisma__ = client;
  }
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  }
});
