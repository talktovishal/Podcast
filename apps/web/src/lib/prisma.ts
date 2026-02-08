import { PrismaClient } from "@prisma/client";
import { env } from "./env";

declare global {
  var __prisma__: PrismaClient | undefined;
}

process.env.DATABASE_URL = process.env.DATABASE_URL ?? env.databaseUrl;

export const prisma = global.__prisma__ ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma__ = prisma;
}
