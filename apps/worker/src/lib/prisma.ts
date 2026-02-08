import { PrismaClient } from "@prisma/client";
import { workerEnv } from "./env.js";

process.env.DATABASE_URL = process.env.DATABASE_URL ?? workerEnv.databaseUrl;

export const prisma = new PrismaClient();
