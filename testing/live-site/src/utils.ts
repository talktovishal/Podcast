import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeJson(path: string, payload: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function writeText(path: string, text: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, text, "utf8");
}

export function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithTimeout(input: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    allowFailure?: boolean;
  }
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      const result = { exitCode, stdout, stderr };
      if (!options.allowFailure && exitCode !== 0) {
        reject(new Error(`${command} ${args.join(" ")} failed (${exitCode ?? "unknown"})\n${stderr || stdout}`));
        return;
      }
      resolve(result);
    });
  });
}

export function summarizeCommandOutput(result: CommandResult): string {
  const sections = [];
  if (result.stdout.trim()) {
    sections.push(result.stdout.trim());
  }
  if (result.stderr.trim()) {
    sections.push(result.stderr.trim());
  }
  return sections.join("\n");
}

export function joinCookieHeader(setCookies: string[]): string {
  return setCookies
    .map((value) => value.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

export function safeFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function reportPath(root: string, ...segments: string[]): string {
  return join(root, ...segments);
}

export function trimToSingleLine(input: string | null | undefined): string {
  return String(input || "").replace(/\s+/g, " ").trim();
}
