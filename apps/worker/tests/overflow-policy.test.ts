import assert from "node:assert/strict";
import test from "node:test";
import { createInitialOverflowPolicyState, evaluateOverflowPolicy } from "../src/lib/overflowPolicy.js";

const baseConfig = {
  activateQueueDepth: 8,
  deactivateQueueDepth: 2,
  activateOldestMs: 300_000,
  deactivateOldestMs: 120_000,
  minActiveMs: 180_000
};

test("activates overflow mode when queue depth crosses threshold", () => {
  const startedAt = new Date("2026-03-01T00:00:00.000Z");
  const initial = createInitialOverflowPolicyState(startedAt);

  const decision = evaluateOverflowPolicy({
    config: baseConfig,
    snapshot: {
      eligibleJobs: 9,
      oldestEligibleJobAgeMs: 0
    },
    previous: initial,
    now: new Date("2026-03-01T00:00:10.000Z")
  });

  assert.equal(decision.changed, true);
  assert.equal(decision.state.active, true);
  assert.equal(decision.state.reason, "queue_depth");
});

test("activates overflow mode when oldest queued age crosses threshold", () => {
  const startedAt = new Date("2026-03-01T00:00:00.000Z");
  const initial = createInitialOverflowPolicyState(startedAt);

  const decision = evaluateOverflowPolicy({
    config: baseConfig,
    snapshot: {
      eligibleJobs: 1,
      oldestEligibleJobAgeMs: 301_000
    },
    previous: initial,
    now: new Date("2026-03-01T00:01:00.000Z")
  });

  assert.equal(decision.changed, true);
  assert.equal(decision.state.active, true);
  assert.equal(decision.state.reason, "oldest_age");
});

test("keeps overflow active until minimum active duration is met", () => {
  const activeState = {
    active: true,
    lastChangedAt: new Date("2026-03-01T00:00:00.000Z"),
    reason: "queue_depth"
  };

  const decision = evaluateOverflowPolicy({
    config: baseConfig,
    snapshot: {
      eligibleJobs: 0,
      oldestEligibleJobAgeMs: 0
    },
    previous: activeState,
    now: new Date("2026-03-01T00:02:00.000Z")
  });

  assert.equal(decision.changed, false);
  assert.equal(decision.state.active, true);
});

test("deactivates overflow after recovery and minimum active duration", () => {
  const activeState = {
    active: true,
    lastChangedAt: new Date("2026-03-01T00:00:00.000Z"),
    reason: "queue_depth"
  };

  const decision = evaluateOverflowPolicy({
    config: baseConfig,
    snapshot: {
      eligibleJobs: 1,
      oldestEligibleJobAgeMs: 30_000
    },
    previous: activeState,
    now: new Date("2026-03-01T00:04:00.000Z")
  });

  assert.equal(decision.changed, true);
  assert.equal(decision.state.active, false);
  assert.equal(decision.state.reason, "recovered");
});
