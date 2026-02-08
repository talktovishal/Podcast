import { resolve } from "node:path";

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? `file:${resolve(process.cwd(), ".data/db.sqlite")}`,
  mediaRoot: process.env.MEDIA_ROOT ?? resolve(process.cwd(), ".data/media"),
  uploadRoot: process.env.UPLOAD_ROOT ?? resolve(process.cwd(), ".data/uploads"),
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  appleClientId: process.env.APPLE_CLIENT_ID,
  appleClientSecret: process.env.APPLE_CLIENT_SECRET,
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@listenlater.local",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin-demo-password"
};
