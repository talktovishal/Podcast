import assert from "node:assert/strict";
import test from "node:test";
import { createWorkerPoller } from "../src/lib/work-poller.js";

const classes = ["item", "summary", "articleSummary", "digest"] as const;
type WorkClass = (typeof classes)[number];

function fixture() {
  const calls: WorkClass[] = [];
  const served: WorkClass[] = [];
  const events: string[] = [];
  const errors: Array<{ source: string; error: unknown }> = [];
  const ready: Record<WorkClass, boolean> = { item: true, summary: true, articleSummary: true, digest: true };
  const ticks = { pending: false, checks: 0, runs: 0 };
  const processor = (workClass: WorkClass) => async () => {
    calls.push(workClass);
    events.push(workClass);
    if (ready[workClass]) served.push(workClass);
    return ready[workClass];
  };
  const options: Parameters<typeof createWorkerPoller>[0] = {
    role: "primary",
    processors: {
      item: processor("item"), summary: processor("summary"),
      articleSummary: processor("articleSummary"), digest: processor("digest")
    },
    scheduler: {
      internalEnabled: false,
      intervalMs: 100,
      hasPendingTick: async () => {
        ticks.checks++;
        return ticks.pending;
      },
      schedule: async () => {
        ticks.runs++;
        ticks.pending = false;
        events.push("schedule");
      }
    },
    onError: async (source, error) => { errors.push({ source, error }); }
  };
  return { options, calls, served, events, errors, ready, ticks };
}

for (let mask = 1; mask < 16; mask++) {
  test(`equal round-robin skips empty classes without wasting turns (mask ${mask})`, async () => {
    const f = fixture();
    const active = classes.filter((workClass, index) => {
      f.ready[workClass] = Boolean(mask & (1 << index));
      return f.ready[workClass];
    });
    const poll = createWorkerPoller(f.options);
    for (let turn = 0; turn < 100; turn++) {
      assert.equal(await poll(), true);
    }
    assert.deepEqual(f.served, Array.from({ length: 100 }, (_, turn) => active[turn % active.length]));
    for (const workClass of active) {
      const turns = f.served.flatMap((served, turn) => served === workClass ? [turn] : []);
      assert.ok(turns[0] < 4, "first opportunity must occur within four polls");
      for (let index = 1; index < turns.length; index++) {
        assert.ok(turns[index] - turns[index - 1] <= 4, "no active class can be starved");
      }
    }
    assert.deepEqual(f.errors, []);
  });
}

test("all-idle polling checks each class once and returns the existing backoff signal", async () => {
  const f = fixture();
  for (const workClass of classes) f.ready[workClass] = false;
  const poll = createWorkerPoller(f.options);
  assert.equal(await poll(), false);
  assert.deepEqual(f.calls, classes);
  assert.equal(await poll(), false);
  assert.deepEqual(f.calls, [...classes, ...classes]);
  f.ready.summary = true;
  assert.equal(await poll(), true);
  assert.deepEqual(f.served, ["summary"]);
});

test("newly ready classes get a turn despite a continuously busy item queue", async () => {
  const f = fixture();
  f.ready.summary = f.ready.articleSummary = f.ready.digest = false;
  const poll = createWorkerPoller(f.options);
  for (let turn = 0; turn < 10; turn++) assert.equal(await poll(), true);
  f.ready.summary = f.ready.articleSummary = f.ready.digest = true;
  for (let turn = 0; turn < 4; turn++) assert.equal(await poll(), true);
  assert.deepEqual(f.served.slice(10), ["summary", "articleSummary", "digest", "item"]);
});

test("persistent item exceptions are reported without starving healthy classes", async () => {
  const f = fixture();
  const failure = new Error("item queue unavailable");
  f.options.processors.item = async () => { throw failure; };
  const poll = createWorkerPoller(f.options);
  for (let turn = 0; turn < 100; turn++) assert.equal(await poll(), true);
  const healthy = ["summary", "articleSummary", "digest"];
  assert.deepEqual(f.served, Array.from({ length: 100 }, (_, turn) => healthy[turn % healthy.length]));
  assert.equal(f.errors.length, 34);
  assert.ok(f.errors.every(({ source, error }) => source === "item" && error === failure));
});

test("every failing class is attempted once before backing off", async () => {
  const f = fixture();
  for (const workClass of classes) {
    f.options.processors[workClass] = async () => { throw new Error(workClass); };
  }
  assert.equal(await createWorkerPoller(f.options)(), false);
  assert.deepEqual(f.errors.map(({ source }) => source), classes);
});

test("error-reporting failures propagate instead of being silently swallowed", async () => {
  const f = fixture();
  const reportingFailure = new Error("error reporting failed");
  f.options.processors.item = async () => { throw new Error("queue failed"); };
  f.options.onError = async () => { throw reportingFailure; };
  await assert.rejects(createWorkerPoller(f.options)(), (error) => error === reportingFailure);
  assert.deepEqual(f.served, []);
});

test("processor calls never overlap while scanning idle classes", async () => {
  const f = fixture();
  let active = 0;
  let maximum = 0;
  for (const workClass of classes) {
    f.options.processors[workClass] = async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      return false;
    };
  }
  assert.equal(await createWorkerPoller(f.options)(), false);
  assert.equal(maximum, 1);
  assert.equal(active, 0);
});

test("internal scheduling runs before busy work and keeps its exact interval boundary", async (t) => {
  const f = fixture();
  f.options.scheduler.internalEnabled = true;
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const poll = createWorkerPoller(f.options);
  assert.equal(await poll(), true);
  assert.deepEqual(f.events, ["schedule", "item"]);
  assert.equal(f.ticks.checks, 0);
  now = 1099;
  await poll();
  assert.equal(f.ticks.runs, 1);
  assert.equal(f.ticks.checks, 1);
  now = 1100;
  await poll();
  assert.equal(f.ticks.runs, 2);
  assert.equal(f.ticks.checks, 1);
  assert.deepEqual(f.served, ["item", "summary", "articleSummary"]);
});

test("external ticks are honored with the internal scheduler disabled", async () => {
  const f = fixture();
  f.ticks.pending = true;
  const poll = createWorkerPoller(f.options);
  await poll();
  assert.deepEqual(f.events, ["schedule", "item"]);
  assert.equal(f.ticks.checks, 1);
  await poll();
  assert.equal(f.ticks.runs, 1);
  assert.equal(f.ticks.checks, 2);
});

test("a pending tick can create digest work in an otherwise idle poll", async () => {
  const f = fixture();
  for (const workClass of classes) f.ready[workClass] = false;
  f.ticks.pending = true;
  f.options.scheduler.schedule = async () => {
    f.ticks.pending = false;
    f.ready.digest = true;
  };
  assert.equal(await createWorkerPoller(f.options)(), true);
  assert.deepEqual(f.served, ["digest"]);
});

test("external scheduling resets the shared cadence just as internal scheduling does", async (t) => {
  const f = fixture();
  f.options.scheduler.internalEnabled = true;
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const poll = createWorkerPoller(f.options);
  await poll();
  now = 1050;
  f.ticks.pending = true;
  await poll();
  assert.equal(f.ticks.runs, 2);
  now = 1100;
  await poll();
  assert.equal(f.ticks.runs, 2);
  now = 1150;
  await poll();
  assert.equal(f.ticks.runs, 3);
});

test("tick lookup failures do not prevent work-class rotation", async () => {
  const f = fixture();
  const failure = new Error("tick lookup failed");
  f.options.scheduler.hasPendingTick = async () => { throw failure; };
  const poll = createWorkerPoller(f.options);
  for (let turn = 0; turn < 8; turn++) assert.equal(await poll(), true);
  assert.deepEqual(f.served, [...classes, ...classes]);
  assert.equal(f.errors.length, 8);
  assert.ok(f.errors.every(({ source, error }) => source === "digestScheduler" && error === failure));
});

test("failed scheduling remains due and retries without blocking busy jobs", async (t) => {
  const f = fixture();
  f.options.scheduler.internalEnabled = true;
  t.mock.method(Date, "now", () => 1000);
  const failure = new Error("scheduling failed");
  f.options.scheduler.schedule = async () => {
    if (++f.ticks.runs === 1) throw failure;
  };
  const poll = createWorkerPoller(f.options);
  for (let turn = 0; turn < 3; turn++) assert.equal(await poll(), true);
  assert.equal(f.ticks.runs, 2);
  assert.deepEqual(f.errors, [{ source: "digestScheduler", error: failure }]);
  assert.deepEqual(f.served, ["item", "summary", "articleSummary"]);
});

for (const available of [true, false]) {
  test(`overflow stays item-only and never checks digest scheduling (available ${available})`, async () => {
    const f = fixture();
    f.options.role = "overflow";
    f.options.scheduler.internalEnabled = true;
    f.ticks.pending = true;
    f.ready.item = available;
    const poll = createWorkerPoller(f.options);
    for (let turn = 0; turn < 8; turn++) assert.equal(await poll(), available);
    assert.deepEqual(f.calls, Array.from({ length: 8 }, () => "item"));
    assert.equal(f.ticks.checks, 0);
    assert.equal(f.ticks.runs, 0);
  });
}

test("overflow item failures are logged and return the backoff signal", async () => {
  const f = fixture();
  f.options.role = "overflow";
  const failure = new Error("item poll failed");
  f.options.processors.item = async () => { throw failure; };
  assert.equal(await createWorkerPoller(f.options)(), false);
  assert.deepEqual(f.errors, [{ source: "item", error: failure }]);
  assert.deepEqual(f.calls, []);
  assert.equal(f.ticks.checks, 0);
});
