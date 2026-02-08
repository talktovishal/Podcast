import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../web/.env") });

export const workerEnv = {
  databaseUrl: process.env.DATABASE_URL ?? `file:${resolve(process.cwd(), "../web/.data/db.sqlite")}`,
  mediaRoot: process.env.MEDIA_ROOT ?? resolve(process.cwd(), "../web/.data/media"),
  pollMs: Number(process.env.WORKER_POLL_MS ?? 2500),
  openAiApiKey: process.env.OPENAI_API_KEY,
  pythonTtsUrl: process.env.PYTHON_TTS_URL ?? "http://127.0.0.1:8010",
  pythonTtsTimeoutMs: Number(process.env.PYTHON_TTS_TIMEOUT_MS ?? 120000)
};
