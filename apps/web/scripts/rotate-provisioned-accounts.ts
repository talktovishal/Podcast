import { TableClient, odata, type TableServiceClientOptions } from "@azure/data-tables";
import bcrypt from "bcryptjs";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const inputLimit = 64 * 1024;
const sessionLimit = 10_000;
const secretNames = ["ADMIN_PASSWORD", "DEMO_PASSWORD", "WEBSTORE_REVIEWER_PASSWORD"] as const;
const requestSchema = z.object({
  storageAccount: z.string().regex(/^[a-z0-9]{3,24}$/),
  tablePrefix: z.string().regex(/^[a-z][a-z0-9]{0,54}$/),
  targets: z.array(z.object({
    userId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    email: z.string().email().max(320),
    role: z.enum(["ADMIN", "USER"]),
    replacementSecret: z.enum(secretNames),
    retiredPasswords: z.array(z.string().min(1).max(1024)).min(1).max(16)
  }).strict()).min(1).max(3)
}).strict();

export type RotationRequest = z.infer<typeof requestSchema>;
export type RotationRow = Record<string, unknown> & {
  partitionKey: string;
  rowKey: string;
  etag: string;
};
export interface RotationStore {
  getUser(userId: string): Promise<RotationRow>;
  listSessions(userId: string): Promise<RotationRow[]>;
  replacePassword(userId: string, passwordHash: string, etag: string): Promise<string>;
  deleteSession(rowKey: string, etag: string): Promise<void>;
}

export class RotationError extends Error {
  constructor(readonly code: string, readonly mayHaveMutated = false) {
    super(code);
  }
}

export function parseRotationRequest(text: string): RotationRequest {
  if (Buffer.byteLength(text, "utf8") > inputLimit) {
    throw new RotationError("ROTATION_INPUT_TOO_LARGE");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RotationError("ROTATION_INPUT_INVALID");
  }
  return validateRequest(value);
}

function validateRequest(value: unknown): RotationRequest {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) {
    throw new RotationError("ROTATION_INPUT_INVALID");
  }
  const request = parsed.data;
  for (const select of [
    (target: RotationRequest["targets"][number]) => target.userId,
    (target: RotationRequest["targets"][number]) => target.email.toLowerCase(),
    (target: RotationRequest["targets"][number]) => target.replacementSecret
  ]) {
    if (new Set(request.targets.map(select)).size !== request.targets.length) {
      throw new RotationError("ROTATION_TARGETS_NOT_UNIQUE");
    }
  }
  return request;
}

function requireEtag(etag: unknown): string {
  if (typeof etag !== "string" || !etag || etag === "*") {
    throw new RotationError("ROTATION_ETAG_REQUIRED");
  }
  return etag;
}

function stableUser(row: RotationRow): Record<string, unknown> {
  const changed = new Set(["passwordHash", "updatedAt", "etag", "timestamp"]);
  return Object.fromEntries(Object.entries(row).filter(([name]) => !changed.has(name)));
}

function checkUser(row: RotationRow, target: RotationRequest["targets"][number]): string {
  requireEtag(row.etag);
  if (row.partitionKey !== "user" || row.rowKey !== target.userId ||
      row.email !== target.email.toLowerCase() || row.role !== target.role) {
    throw new RotationError("ROTATION_TARGET_MISMATCH");
  }
  if (typeof row.passwordHash !== "string" || !/^\$2[ab]\$12\$[./A-Za-z0-9]{53}$/.test(row.passwordHash)) {
    throw new RotationError("ROTATION_UNSUPPORTED_PASSWORD_HASH");
  }
  return row.passwordHash;
}

function checkSessions(rows: RotationRow[], userId: string): void {
  if (rows.length > sessionLimit) {
    throw new RotationError("ROTATION_SESSION_LIMIT");
  }
  const keys = new Set<string>();
  for (const row of rows) {
    requireEtag(row.etag);
    if (row.partitionKey !== "session" || row.userId !== userId ||
        typeof row.rowKey !== "string" || !row.rowKey || row.tokenHash !== row.rowKey ||
        keys.has(row.rowKey)) {
      throw new RotationError("ROTATION_SESSION_MISMATCH");
    }
    keys.add(row.rowKey);
  }
}

export async function rotateAccounts(
  request: RotationRequest,
  store: RotationStore,
  secrets: Partial<Record<(typeof secretNames)[number], string>>,
  options: { apply: boolean; writersQuiesced: boolean }
) {
  if (options.apply && !options.writersQuiesced) {
    throw new RotationError("ROTATION_REQUIRES_QUIESCED_WRITERS");
  }
  request = validateRequest(request);
  let mayHaveMutated = false;
  try {
    const prepared = [];
    const replacements = new Set<string>();
    for (const [index, target] of request.targets.entries()) {
      const replacement = secrets[target.replacementSecret];
      if (!replacement || Buffer.byteLength(replacement, "utf8") < 32 ||
          Buffer.byteLength(replacement, "utf8") > 72 || /\s|[\x00-\x1f\x7f]/.test(replacement)) {
        throw new RotationError("ROTATION_REPLACEMENT_INVALID");
      }
      if (replacements.has(replacement)) {
        throw new RotationError("ROTATION_REPLACEMENT_REUSED");
      }
      replacements.add(replacement);
      const original = await store.getUser(target.userId);
      const currentHash = checkUser(original, target);
      const alreadyReplaced = await bcrypt.compare(replacement, currentHash);
      const nextHash = alreadyReplaced ? currentHash : await bcrypt.hash(replacement, 12);
      let retiredCurrentlyAccepted = false;
      for (const retired of target.retiredPasswords) {
        if (await bcrypt.compare(retired, nextHash)) {
          throw new RotationError("ROTATION_REPLACEMENT_ACCEPTS_RETIRED_PASSWORD");
        }
        retiredCurrentlyAccepted = (await bcrypt.compare(retired, currentHash)) || retiredCurrentlyAccepted;
      }
      const sessions = await store.listSessions(target.userId);
      checkSessions(sessions, target.userId);
      prepared.push({ index, target, original, sessions, nextHash, alreadyReplaced,
        expectedEtag: original.etag, retiredCurrentlyAccepted });
    }

    if (options.apply) {
      for (const entry of prepared) {
        if (!entry.alreadyReplaced) {
          mayHaveMutated = true;
          entry.expectedEtag = requireEtag(await store.replacePassword(
            entry.target.userId, entry.nextHash, entry.original.etag
          ));
        }
        const updated = await store.getUser(entry.target.userId);
        if (checkUser(updated, entry.target) !== entry.nextHash || updated.etag !== entry.expectedEtag ||
            !isDeepStrictEqual(stableUser(updated), stableUser(entry.original))) {
          throw new RotationError("ROTATION_USER_POSTCONDITION_FAILED");
        }
        for (const session of entry.sessions) {
          mayHaveMutated = true;
          await store.deleteSession(session.rowKey, session.etag);
        }
      }
      for (const entry of prepared) {
        const final = await store.getUser(entry.target.userId);
        if (checkUser(final, entry.target) !== entry.nextHash || final.etag !== entry.expectedEtag ||
            !isDeepStrictEqual(stableUser(final), stableUser(entry.original))) {
          throw new RotationError("ROTATION_USER_POSTCONDITION_FAILED");
        }
        const remaining = await store.listSessions(entry.target.userId);
        checkSessions(remaining, entry.target.userId);
        if (remaining.length) {
          throw new RotationError("ROTATION_SESSIONS_REMAIN");
        }
      }
    }
    return {
      ok: true,
      mode: options.apply ? "apply" : "check",
      targets: prepared.map((entry) => ({
        index: entry.index,
        passwordAlreadyReplaced: entry.alreadyReplaced,
        retiredCurrentlyAccepted: options.apply ? false : entry.retiredCurrentlyAccepted,
        browserSessionCount: options.apply ? 0 : entry.sessions.length
      }))
    };
  } catch (error) {
    throw new RotationError(
      error instanceof RotationError ? error.code : "ROTATION_STORE_OPERATION_FAILED",
      mayHaveMutated
    );
  }
}

function toRow(value: Record<string, unknown>): RotationRow {
  if (typeof value.partitionKey !== "string" || typeof value.rowKey !== "string") {
    throw new RotationError("ROTATION_ROW_INVALID");
  }
  return { ...value, partitionKey: value.partitionKey, rowKey: value.rowKey, etag: requireEtag(value.etag) };
}

export function createRotationStore(
  request: RotationRequest,
  environment: Readonly<Record<string, string | undefined>>,
  httpClient?: TableServiceClientOptions["httpClient"]
): RotationStore {
  const connectionString = environment.AZURE_TABLE_CONNECTION_STRING;
  if (environment.ARTICLEPOD_SECRET_SOURCE !== "keyvault" || environment.RUNTIME_PROFILE !== "azure" ||
      environment.METADATA_PRIMARY_BACKEND !== "azure_table" ||
      environment.ARTICLEPOD_BOOTSTRAP_ADMIN_ON_STARTUP !== "0" ||
      environment.AZURE_TABLE_PREFIX !== request.tablePrefix ||
      !connectionString || environment.AZURE_LOG_LEVEL || environment.DEBUG) {
    throw new RotationError("ROTATION_RUNTIME_NOT_APPROVED");
  }
  const createClient = (suffix: "users" | "sessions") => {
    const client = TableClient.fromConnectionString(
      connectionString, request.tablePrefix + suffix,
      { retryOptions: { maxRetries: 0 }, httpClient }
    );
    const endpoint = new URL(client.url);
    if (endpoint.origin !== `https://${request.storageAccount}.table.core.windows.net` ||
        endpoint.pathname !== "/" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new RotationError("ROTATION_STORAGE_ACCOUNT_MISMATCH");
    }
    return client;
  };
  const users = createClient("users");
  const sessions = createClient("sessions");
  return {
    async getUser(userId) {
      return toRow(await users.getEntity<Record<string, unknown>>("user", userId));
    },
    async listSessions(userId) {
      const rows: RotationRow[] = [];
      const filter = odata`PartitionKey eq ${"session"} and userId eq ${userId}`;
      for await (const row of sessions.listEntities<Record<string, unknown>>({ queryOptions: { filter } })) {
        rows.push(toRow(row));
        if (rows.length > sessionLimit) {
          throw new RotationError("ROTATION_SESSION_LIMIT");
        }
      }
      return rows;
    },
    async replacePassword(userId, passwordHash, etag) {
      const result = await users.updateEntity({
        partitionKey: "user", rowKey: userId, passwordHash, updatedAt: new Date().toISOString()
      }, "Merge", { etag: requireEtag(etag) });
      return requireEtag(result.etag);
    },
    async deleteSession(rowKey, etag) {
      await sessions.deleteEntity("session", rowKey, { etag: requireEtag(etag) });
    }
  };
}

async function main(): Promise<void> {
  try {
    const [mode, attestation, ...extra] = process.argv.slice(2);
    if (!["check", "apply"].includes(mode) || extra.length ||
        (attestation !== undefined && attestation !== "--writers-quiesced")) {
      throw new RotationError("ROTATION_USAGE_CHECK_OR_APPLY");
    }
    if (mode === "apply" && attestation !== "--writers-quiesced") {
      throw new RotationError("ROTATION_REQUIRES_QUIESCED_WRITERS");
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > inputLimit) {
        throw new RotationError("ROTATION_INPUT_TOO_LARGE");
      }
      chunks.push(bytes);
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    } catch {
      throw new RotationError("ROTATION_INPUT_INVALID");
    }
    const request = parseRotationRequest(text);
    const store = createRotationStore(request, process.env);
    const result = await rotateAccounts(request, store, {
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
      DEMO_PASSWORD: process.env.DEMO_PASSWORD,
      WEBSTORE_REVIEWER_PASSWORD: process.env.WEBSTORE_REVIEWER_PASSWORD
    }, {
      apply: mode === "apply", writersQuiesced: attestation === "--writers-quiesced"
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof RotationError ? error.code : "ROTATION_SETUP_FAILED",
      mayHaveMutated: error instanceof RotationError && error.mayHaveMutated
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
