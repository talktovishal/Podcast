export type OverflowPolicyConfig = {
  activateQueueDepth: number;
  deactivateQueueDepth: number;
  activateOldestMs: number;
  deactivateOldestMs: number;
  minActiveMs: number;
};

export type OverflowPolicySnapshot = {
  eligibleJobs: number;
  oldestEligibleJobAgeMs: number;
};

export type OverflowPolicyState = {
  active: boolean;
  lastChangedAt: Date;
  reason: string;
};

export type OverflowPolicyDecision = {
  state: OverflowPolicyState;
  changed: boolean;
  activateTriggered: boolean;
  deactivateTriggered: boolean;
  activeDurationMs: number;
};

function clampPolicyConfig(config: OverflowPolicyConfig): OverflowPolicyConfig {
  return {
    activateQueueDepth: Math.max(0, config.activateQueueDepth),
    deactivateQueueDepth: Math.max(0, Math.min(config.deactivateQueueDepth, config.activateQueueDepth)),
    activateOldestMs: Math.max(0, config.activateOldestMs),
    deactivateOldestMs: Math.max(0, Math.min(config.deactivateOldestMs, config.activateOldestMs)),
    minActiveMs: Math.max(0, config.minActiveMs)
  };
}

export function createInitialOverflowPolicyState(now: Date): OverflowPolicyState {
  return {
    active: false,
    lastChangedAt: now,
    reason: "startup"
  };
}

export function evaluateOverflowPolicy(input: {
  config: OverflowPolicyConfig;
  snapshot: OverflowPolicySnapshot;
  previous: OverflowPolicyState;
  now: Date;
}): OverflowPolicyDecision {
  const config = clampPolicyConfig(input.config);
  const queueDepth = Math.max(0, input.snapshot.eligibleJobs);
  const oldestMs = Math.max(0, input.snapshot.oldestEligibleJobAgeMs);
  const activeDurationMs = input.previous.active
    ? Math.max(0, input.now.getTime() - input.previous.lastChangedAt.getTime())
    : 0;

  const activateTriggered = queueDepth >= config.activateQueueDepth || oldestMs >= config.activateOldestMs;
  const deactivateTriggered = queueDepth <= config.deactivateQueueDepth && oldestMs <= config.deactivateOldestMs;

  if (!input.previous.active && activateTriggered) {
    return {
      state: {
        active: true,
        lastChangedAt: input.now,
        reason: queueDepth >= config.activateQueueDepth ? "queue_depth" : "oldest_age"
      },
      changed: true,
      activateTriggered,
      deactivateTriggered,
      activeDurationMs: 0
    };
  }

  if (input.previous.active && deactivateTriggered && activeDurationMs >= config.minActiveMs) {
    return {
      state: {
        active: false,
        lastChangedAt: input.now,
        reason: "recovered"
      },
      changed: true,
      activateTriggered,
      deactivateTriggered,
      activeDurationMs
    };
  }

  return {
    state: input.previous,
    changed: false,
    activateTriggered,
    deactivateTriggered,
    activeDurationMs
  };
}
