import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import bcrypt from "bcryptjs";
import {
  createRotationStore, parseRotationRequest, rotateAccounts, RotationError,
  type RotationRequest, type RotationRow, type RotationStore
} from "../scripts/rotate-provisioned-accounts";

const retired = "fixture-old-password";
const replacement = "fixture-next-".repeat(4);
const oldHash = await bcrypt.hash(retired, 12);
const replacementHash = await bcrypt.hash(replacement, 12);
const request: RotationRequest = {
  storageAccount: "fixtureaccount",
  tablePrefix: "fixture",
  targets: [{
    userId: "fixture-user", email: "fixture@example.invalid", role: "ADMIN",
    replacementSecret: "ADMIN_PASSWORD", retiredPasswords: [retired]
  }]
};
const apply = { apply: true, writersQuiesced: true };
const secrets = { ADMIN_PASSWORD: replacement };

class MemoryStore implements RotationStore {
  users = new Map<string, RotationRow>([
    ["fixture-user", {
      partitionKey: "user", rowKey: "fixture-user", etag: "v1",
      email: "fixture@example.invalid", role: "ADMIN", passwordHash: oldHash,
      name: "Fixture", feedTokenValue: "fixture-feed", billingCustomerId: "fixture-billing",
      futureField: { preserve: true }, updatedAt: "earlier"
    }],
    ["untargeted", {
      partitionKey: "user", rowKey: "untargeted", etag: "other-v1", passwordHash: oldHash
    }]
  ]);
  sessions = new Map<string, RotationRow>([
    ["fixture-session", {
      partitionKey: "session", rowKey: "fixture-session", tokenHash: "fixture-session",
      etag: "s1", userId: "fixture-user"
    }],
    ["untargeted-session", {
      partitionKey: "session", rowKey: "untargeted-session", tokenHash: "untargeted-session",
      etag: "other-s1", userId: "untargeted"
    }]
  ]);
  writes: string[] = [];
  userReads = 0;
  beforeReplace?: () => void;
  afterDelete?: () => void;
  failDelete = false;

  async getUser(id: string) {
    this.userReads += 1;
    const row = this.users.get(id);
    if (!row) throw new Error("fixture provider detail must not escape");
    return structuredClone(row);
  }
  async listSessions(id: string) {
    return structuredClone([...this.sessions.values()].filter((row) => row.userId === id));
  }
  async replacePassword(id: string, passwordHash: string, etag: string) {
    this.beforeReplace?.();
    const row = this.users.get(id);
    if (!row || row.etag !== etag) throw new Error("fixture conflict");
    this.writes.push("password");
    this.users.set(id, { ...row, passwordHash, updatedAt: "later", etag: "v2" });
    return "v2";
  }
  async deleteSession(key: string, etag: string) {
    const row = this.sessions.get(key);
    if (this.failDelete || !row || row.etag !== etag) throw new Error("fixture secret-bearing provider error");
    this.writes.push("session");
    this.sessions.delete(key);
    this.afterDelete?.();
  }
}

function code(expected: string, mutated?: boolean) {
  return (error: unknown) => {
    assert.ok(error instanceof RotationError);
    assert.equal(error.code, expected);
    if (mutated !== undefined) assert.equal(error.mayHaveMutated, mutated);
    return true;
  };
}

test("rotation check is read-only and reports only ordinal status and counts", async () => {
  const store = new MemoryStore();
  const before = structuredClone(store.users);
  const result = await rotateAccounts(request, store, secrets, { apply: false, writersQuiesced: false });
  assert.deepEqual(store.users, before);
  assert.deepEqual(store.writes, []);
  assert.deepEqual(result.targets, [{
    index: 0, passwordAlreadyReplaced: false, retiredCurrentlyAccepted: true, browserSessionCount: 1
  }]);
  const output = JSON.stringify(result);
  for (const value of [retired, replacement, oldHash, "fixture@example.invalid", "fixture-session"]) {
    assert.equal(output.includes(value), false);
  }
});

test("apply replaces only the selected hash and sessions while preserving other data", async () => {
  const store = new MemoryStore();
  const other = await store.getUser("untargeted");
  const result = await rotateAccounts(request, store, secrets, apply);
  const changed = await store.getUser("fixture-user");
  assert.ok(typeof changed.passwordHash === "string");
  const hash = changed.passwordHash;
  assert.equal(bcrypt.getRounds(hash), 12);
  assert.equal(await bcrypt.compare(retired, hash), false);
  assert.equal(await bcrypt.compare(replacement, hash), true);
  assert.equal(changed.feedTokenValue, "fixture-feed");
  assert.equal(changed.billingCustomerId, "fixture-billing");
  assert.deepEqual(changed.futureField, { preserve: true });
  assert.deepEqual(await store.getUser("untargeted"), other);
  assert.deepEqual([...store.sessions.keys()], ["untargeted-session"]);
  assert.deepEqual(store.writes, ["password", "session"]);
  assert.equal(result.targets[0].retiredCurrentlyAccepted, false);
});

test("apply refuses an unfenced operation before reads or writes", async () => {
  const store = new MemoryStore();
  await assert.rejects(rotateAccounts(request, store, secrets, { apply: true, writersQuiesced: false }),
    code("ROTATION_REQUIRES_QUIESCED_WRITERS", false));
  assert.equal(store.userReads, 0);
  assert.deepEqual(store.writes, []);
});

test("every target is validated before any password changes", async () => {
  const store = new MemoryStore();
  const invalid = structuredClone(request);
  invalid.targets.push({
    ...invalid.targets[0], userId: "missing", email: "missing@example.invalid", replacementSecret: "DEMO_PASSWORD"
  });
  await assert.rejects(rotateAccounts(invalid, store, { ...secrets, DEMO_PASSWORD: "fixture-second-".repeat(4) }, apply),
    code("ROTATION_STORE_OPERATION_FAILED", false));
  assert.deepEqual(store.writes, []);
});

test("identity mismatches and OAuth-only or unsupported hashes cannot be converted", async () => {
  for (const change of [{ role: "USER" }, { email: "different@example.invalid" }, { passwordHash: null },
    { passwordHash: oldHash.replace("$12$", "$31$") }]) {
    const store = new MemoryStore();
    const row = await store.getUser("fixture-user");
    store.users.set("fixture-user", { ...row, ...change });
    await assert.rejects(rotateAccounts(request, store, secrets, apply), RotationError);
    assert.deepEqual(store.writes, []);
  }
});

test("missing, short, oversized, and whitespace replacement values fail before mutations", async () => {
  for (const value of [undefined, "short", "a".repeat(73), "has whitespace ".repeat(3)]) {
    const store = new MemoryStore();
    await assert.rejects(rotateAccounts(request, store, { ADMIN_PASSWORD: value }, apply),
      code("ROTATION_REPLACEMENT_INVALID", false));
    assert.deepEqual(store.writes, []);
  }
});

test("replacement must reject every retired password, including bcrypt truncation equivalents", async () => {
  const store = new MemoryStore();
  const input = structuredClone(request);
  const next = "f".repeat(72);
  input.targets[0].retiredPasswords.push(next + "ignored-by-bcrypt");
  await assert.rejects(rotateAccounts(input, store, { ADMIN_PASSWORD: next }, apply),
    code("ROTATION_REPLACEMENT_ACCEPTS_RETIRED_PASSWORD", false));
  assert.deepEqual(store.writes, []);
});

test("a changed user ETag fails rather than overwriting a concurrent edit", async () => {
  const store = new MemoryStore();
  store.beforeReplace = () => {
    const row = store.users.get("fixture-user");
    assert.ok(row);
    store.users.set("fixture-user", { ...row, etag: "concurrent", name: "preserve concurrent edit" });
  };
  await assert.rejects(rotateAccounts(request, store, secrets, apply),
    code("ROTATION_STORE_OPERATION_FAILED", true));
  assert.deepEqual(store.writes, []);
  assert.equal((await store.getUser("fixture-user")).name, "preserve concurrent edit");
});

test("a changed session ETag is not deleted with a wildcard or retry", async () => {
  const store = new MemoryStore();
  store.beforeReplace = () => {
    const session = store.sessions.get("fixture-session");
    assert.ok(session);
    store.sessions.set("fixture-session", { ...session, etag: "changed" });
  };
  await assert.rejects(rotateAccounts(request, store, secrets, apply),
    code("ROTATION_STORE_OPERATION_FAILED", true));
  assert.equal(store.sessions.get("fixture-session")?.etag, "changed");
  assert.deepEqual(store.writes, ["password"]);
});

test("a concurrent post-update user change fails final verification without being overwritten", async () => {
  const store = new MemoryStore();
  store.afterDelete = () => {
    const user = store.users.get("fixture-user");
    assert.ok(user);
    store.users.set("fixture-user", { ...user, etag: "changed", name: "concurrent" });
  };
  await assert.rejects(rotateAccounts(request, store, secrets, apply),
    code("ROTATION_USER_POSTCONDITION_FAILED", true));
  assert.equal((await store.getUser("fixture-user")).name, "concurrent");
});

test("different targeted accounts cannot reuse the same replacement secret value", async () => {
  const store = new MemoryStore();
  const input = structuredClone(request);
  input.targets.push({ ...input.targets[0], userId: "second", email: "second@example.invalid",
    replacementSecret: "DEMO_PASSWORD" });
  await assert.rejects(rotateAccounts(input, store, { ...secrets, DEMO_PASSWORD: replacement }, apply),
    code("ROTATION_REPLACEMENT_REUSED", false));
  assert.deepEqual(store.writes, []);
});

test("partial session failure is explicit and can resume forward without restoring the retired hash", async () => {
  const store = new MemoryStore();
  store.failDelete = true;
  await assert.rejects(rotateAccounts(request, store, secrets, apply),
    code("ROTATION_STORE_OPERATION_FAILED", true));
  assert.equal(await bcrypt.compare(retired, String((await store.getUser("fixture-user")).passwordHash)), false);
  store.failDelete = false;
  const result = await rotateAccounts(request, store, secrets, apply);
  assert.equal(result.targets[0].passwordAlreadyReplaced, true);
  assert.deepEqual(store.writes, ["password", "session"]);
});

test("a multi-account partial failure resumes without rewriting the first account", async () => {
  const store = new MemoryStore();
  const secondReplacement = "fixture-second-".repeat(4);
  const input = structuredClone(request);
  input.targets.push({ ...input.targets[0], userId: "second", email: "second@example.invalid",
    role: "USER", replacementSecret: "DEMO_PASSWORD" });
  store.users.set("second", { ...await store.getUser("fixture-user"), rowKey: "second",
    email: "second@example.invalid", role: "USER", etag: "second-v1" });
  store.beforeReplace = () => {
    if (store.writes.length === 2) {
      const second = store.users.get("second");
      assert.ok(second);
      store.users.set("second", { ...second, etag: "second-concurrent" });
    }
  };
  const replacements = { ...secrets, DEMO_PASSWORD: secondReplacement };
  await assert.rejects(rotateAccounts(input, store, replacements, apply),
    code("ROTATION_STORE_OPERATION_FAILED", true));
  const first = await store.getUser("fixture-user");
  assert.equal((await store.getUser("second")).passwordHash, oldHash);
  store.beforeReplace = undefined;
  const result = await rotateAccounts(input, store, replacements, apply);
  assert.deepEqual(result.targets.map((target) => target.passwordAlreadyReplaced), [true, false]);
  assert.deepEqual(await store.getUser("fixture-user"), first);
  assert.deepEqual(store.writes, ["password", "session", "password"]);
  const second = await store.getUser("second");
  assert.ok(typeof second.passwordHash === "string");
  assert.equal(await bcrypt.compare(retired, second.passwordHash), false);
  assert.equal(await bcrypt.compare(secondReplacement, second.passwordHash), true);
});

test("sessions appearing during apply fail the final empty-session condition", async () => {
  const store = new MemoryStore();
  store.afterDelete = () => store.sessions.set("late", {
    partitionKey: "session", rowKey: "late", tokenHash: "late", etag: "late-v1", userId: "fixture-user"
  });
  await assert.rejects(rotateAccounts(request, store, secrets, apply), code("ROTATION_SESSIONS_REMAIN", true));
});

test("cross-user session rows and wildcard ETags are refused", async () => {
  for (const change of [{ tokenHash: "wrong" }, { etag: "*" }, { partitionKey: "feed" },
    { userId: "untargeted" }]) {
    const store = new MemoryStore();
    const session = store.sessions.get("fixture-session");
    assert.ok(session);
    store.listSessions = async () => [{ ...session, ...change }];
    await assert.rejects(rotateAccounts(request, store, secrets, apply), RotationError);
    assert.deepEqual(store.writes, []);
  }
});

test("input rejects ambiguous targets, extra fields, malformed JSON, and excessive input", () => {
  assert.deepEqual(parseRotationRequest(JSON.stringify(request)), request);
  const duplicate = structuredClone(request);
  duplicate.targets.push(duplicate.targets[0]);
  for (const text of [JSON.stringify(duplicate), JSON.stringify({ ...request, password: "not permitted" }), "{",
    " ".repeat(65_537)]) {
    assert.throws(() => parseRotationRequest(text), RotationError);
  }
});

test("direct rotation calls cannot bypass target validation", async () => {
  const store = new MemoryStore();
  const duplicate = structuredClone(request);
  duplicate.targets.push(duplicate.targets[0]);
  await assert.rejects(rotateAccounts(duplicate, store, secrets, apply),
    code("ROTATION_TARGETS_NOT_UNIQUE", false));
  assert.equal(store.userReads, 0);
  assert.deepEqual(store.writes, []);
});

const runtime = {
  ARTICLEPOD_SECRET_SOURCE: "keyvault", RUNTIME_PROFILE: "azure", METADATA_PRIMARY_BACKEND: "azure_table",
  ARTICLEPOD_BOOTSTRAP_ADMIN_ON_STARTUP: "0", AZURE_TABLE_PREFIX: "fixture",
  AZURE_TABLE_CONNECTION_STRING:
    `DefaultEndpointsProtocol=https;AccountName=fixtureaccount;AccountKey=${Buffer.alloc(32).toString("base64")};EndpointSuffix=core.windows.net`
};

test("the SDK adapter binds storage and uses conditional merge/delete, never table creation", async () => {
  const calls: { method: string; url: string; etag: string | undefined; body: unknown }[] = [];
  const store = createRotationStore(request, runtime, {
    async sendRequest(message) {
      calls.push({
        method: message.method, url: message.url, etag: message.headers.get("if-match"),
        body: typeof message.body === "string" ? JSON.parse(message.body) : null
      });
      message.headers.set("etag", "fixture-next-etag");
      return { request: message, status: 204, headers: message.headers };
    }
  });
  assert.equal(await store.replacePassword("fixture-user", replacementHash, "fixture-user-etag"), "fixture-next-etag");
  await store.deleteSession("fixture-session", "fixture-session-etag");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, "PATCH");
  assert.equal(calls[0].etag, "fixture-user-etag");
  assert.match(calls[0].url, /fixtureusers/);
  const patch = calls[0].body;
  assert.ok(patch && typeof patch === "object");
  assert.deepEqual(Object.keys(patch).sort(), [
    "PartitionKey", "RowKey", "passwordHash", "updatedAt"
  ]);
  assert.equal(calls[1].method, "DELETE");
  assert.equal(calls[1].etag, "fixture-session-etag");
  assert.match(calls[1].url, /fixturesessions/);
});

test("the SDK adapter reads existing entities and filters sessions to the exact selected user", async () => {
  const calls: string[] = [];
  const store = createRotationStore(request, runtime, {
    async sendRequest(message) {
      assert.equal(message.method, "GET");
      calls.push(message.url);
      const user = new URL(message.url).pathname.startsWith("/fixtureusers");
      const body = user ? {
        PartitionKey: "user", RowKey: "fixture-user", "odata.etag": "u1",
        Timestamp: "2026-01-01T00:00:00Z", email: "fixture@example.invalid", role: "ADMIN",
        passwordHash: oldHash, futureField: "preserve"
      } : {
        value: [{ PartitionKey: "session", RowKey: "fixture-session", "odata.etag": "s1",
          userId: "fixture-user", tokenHash: "fixture-session" }]
      };
      message.headers.set("content-type", "application/json");
      return { request: message, status: 200, headers: message.headers, bodyAsText: JSON.stringify(body) };
    }
  });
  const user = await store.getUser("fixture-user");
  assert.equal(user.etag, "u1");
  assert.equal(user.futureField, "preserve");
  assert.equal(user["odata.etag"], undefined);
  const sessions = await store.listSessions("fixture-user");
  assert.equal(sessions[0].etag, "s1");
  assert.equal(sessions[0].userId, "fixture-user");
  assert.equal(new URL(calls[1]).searchParams.get("$filter"), "PartitionKey eq 'session' and userId eq 'fixture-user'");
});

test("the adapter refuses backend, bootstrap, table-prefix, and storage-account drift", () => {
  for (const change of [{ METADATA_PRIMARY_BACKEND: "prisma" }, { ARTICLEPOD_SECRET_SOURCE: "environment" },
    { ARTICLEPOD_BOOTSTRAP_ADMIN_ON_STARTUP: "1" }, { AZURE_TABLE_PREFIX: "elsewhere" }]) {
    assert.throws(() => createRotationStore(request, { ...runtime, ...change }),
      code("ROTATION_RUNTIME_NOT_APPROVED"));
  }
  assert.throws(() => createRotationStore({ ...request, storageAccount: "differentaccount" }, runtime),
    code("ROTATION_STORAGE_ACCOUNT_MISMATCH"));
  for (const endpoint of ["https://fixtureaccount.table.core.windows.net/nested",
    "https://fixtureaccount.table.core.windows.net/?unexpected=query",
    "https://fixtureaccount.table.core.windows.net/#fragment"]) {
    assert.throws(() => createRotationStore(request, {
      ...runtime, AZURE_TABLE_CONNECTION_STRING: runtime.AZURE_TABLE_CONNECTION_STRING + `;TableEndpoint=${endpoint}`
    }), code("ROTATION_STORAGE_ACCOUNT_MISMATCH"));
  }
  assert.throws(() => createRotationStore(request, {
    ...runtime,
    AZURE_TABLE_CONNECTION_STRING:
      "TableEndpoint=https://fixtureaccount.table.core.windows.net;SharedAccessSignature=sv=fixture&sig=fixture"
  }), RotationError);
});

test("the administrative SDK does not retry ambiguous server-side write failures", async () => {
  let calls = 0;
  const store = createRotationStore(request, runtime, {
    async sendRequest(message) {
      calls += 1;
      return { request: message, status: 500, headers: message.headers };
    }
  });
  await assert.rejects(store.replacePassword("fixture-user", replacementHash, "fixture-etag"));
  assert.equal(calls, 1);
});

test("CLI failures do not echo input, connection strings, or replacement passwords", () => {
  const hostNames = new Set(["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP",
    "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA"]);
  const host = Object.fromEntries(Object.entries(process.env).filter(([key]) => hostNames.has(key.toUpperCase())));
  const cli = fileURLToPath(new URL("../scripts/rotate-provisioned-accounts.ts", import.meta.url));
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  const invalidUtf8 = Buffer.from(JSON.stringify(request));
  const candidateOffset = invalidUtf8.indexOf(retired);
  assert.notEqual(candidateOffset, -1);
  invalidUtf8[candidateOffset] = 0xff;
  for (const [args, input, expected] of [
    [["apply"], JSON.stringify(request), "ROTATION_REQUIRES_QUIESCED_WRITERS"],
    [["check"], JSON.stringify({ ...request, accidentalSecret: replacement }), "ROTATION_INPUT_INVALID"],
    [["check"], "x".repeat(65_537), "ROTATION_INPUT_TOO_LARGE"],
    [["check"], invalidUtf8, "ROTATION_INPUT_INVALID"],
    [["check"], JSON.stringify(request), "ROTATION_RUNTIME_NOT_APPROVED"]
  ] as const) {
    const result = spawnSync(process.execPath, ["--import", "tsx", cli, ...args], {
      cwd, input, encoding: "utf8", timeout: 15_000,
      env: { ...host, NODE_ENV: "production", ADMIN_PASSWORD: replacement,
        AZURE_TABLE_CONNECTION_STRING: "fixture-private-connection" }
    });
    assert.notEqual(result.status, 0, result.stdout);
    assert.equal(result.stdout, "");
    const output = JSON.parse(result.stderr);
    assert.deepEqual(Object.keys(output).sort(), ["error", "mayHaveMutated", "ok"]);
    assert.equal(output.ok, false);
    assert.equal(output.error, expected);
    assert.equal(output.mayHaveMutated, false);
    for (const value of [replacement, retired, "fixture-private-connection", "fixture@example.invalid"]) {
      assert.equal(result.stderr.includes(value), false);
    }
  }
});
