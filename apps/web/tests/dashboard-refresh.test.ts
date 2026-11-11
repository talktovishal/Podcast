import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardRefresh } from "../src/lib/dashboard-refresh";
import { mergeItemsPreservingEpisodeTokens } from "../src/lib/dashboard-items";

const unexpected = () => assert.fail("Unexpected refresh callback");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("overlapping focus and interval refreshes are single-flight without cancelling slow work", async () => {
  const refresh = createDashboardRefresh();
  const pending = deferred<string>();
  const applied: string[] = [];
  let calls = 0;
  const load = async () => { calls++; return pending.promise; };
  const first = refresh.run(load, (value) => applied.push(value), unexpected);
  await refresh.run(load, (value) => applied.push(value), unexpected);
  assert.equal(calls, 1);
  pending.resolve("READY");
  await first;
  assert.deepEqual(applied, ["READY"]);
});

test("mutation invalidation prevents an older response restoring deleted items", async () => {
  const refresh = createDashboardRefresh();
  const old = deferred<string[]>();
  let items = ["deleted"];
  let oldSignal: AbortSignal | undefined;
  const first = refresh.run((signal) => { oldSignal = signal; return old.promise; }, (value) => { items = value; }, unexpected);
  refresh.invalidate();
  items = [];
  await refresh.run(async () => ["new"], (value) => { items = value; }, unexpected);
  old.resolve(["deleted"]);
  await first;
  assert.equal(oldSignal?.aborted, true);
  assert.deepEqual(items, ["new"]);
});

test("an obsolete completion cannot unlock a newer in-flight request", async () => {
  const refresh = createDashboardRefresh();
  const old = deferred<string>();
  const current = deferred<string>();
  const first = refresh.run(() => old.promise, unexpected, unexpected);
  refresh.invalidate();
  const second = refresh.run(() => current.promise, () => {}, unexpected);
  old.resolve("stale");
  await first;
  await refresh.run(async () => { assert.fail("new request remains in flight"); }, unexpected, unexpected);
  current.resolve("current");
  await second;
});

test("unmount cancels work and suppresses late response and abort errors", async () => {
  for (const fail of [false, true]) {
    const refresh = createDashboardRefresh();
    const pending = deferred<string>();
    const work = refresh.run(() => pending.promise, unexpected, unexpected);
    refresh.invalidate();
    if (fail) pending.reject(new Error("aborted")); else pending.resolve("stale");
    await work;
  }
});

test("current failures are reported and allow a later successful refresh", async () => {
  const refresh = createDashboardRefresh();
  const error = new Error("offline");
  const errors: unknown[] = [];
  await refresh.run(async () => { throw error; }, unexpected, (value) => errors.push(value));
  assert.deepEqual(errors, [error]);
  let updated = false;
  await refresh.run(async () => "ok", () => { updated = true; }, unexpected);
  assert.equal(updated, true);
});

test("queued state updaters recheck generation and preserve unchanged media tokens", async () => {
  const refresh = createDashboardRefresh();
  let current = [{ id: "item", episode: { id: "episode", audioPath: "audio.mp3", mediaToken: "stable" } }];
  const incoming = [{ id: "item", episode: { id: "episode", audioPath: "audio.mp3", mediaToken: "incoming" } }];
  await refresh.run(async () => incoming, (value) => { current = mergeItemsPreservingEpisodeTokens(current, value); }, unexpected);
  assert.equal(current[0].episode.mediaToken, "stable");
  let applyLater = () => {};
  await refresh.run(async () => incoming, (value, isCurrent) => {
    applyLater = () => { if (isCurrent()) current = value; };
  }, unexpected);
  refresh.invalidate();
  current = [];
  applyLater();
  assert.deepEqual(current, []);
});
