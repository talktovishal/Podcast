type WorkClass = "item" | "summary" | "articleSummary" | "digest";

type WorkPollerOptions = {
  role: "primary" | "overflow";
  processors: Record<WorkClass, () => Promise<boolean>>;
  scheduler: {
    internalEnabled: boolean;
    intervalMs: number;
    hasPendingTick: () => Promise<boolean>;
    schedule: () => Promise<unknown>;
  };
  onError: (source: WorkClass | "digestScheduler", error: unknown) => Promise<void>;
};

export function createWorkerPoller(options: WorkPollerOptions): () => Promise<boolean> {
  const order: readonly WorkClass[] = options.role === "primary"
    ? ["item", "summary", "articleSummary", "digest"]
    : ["item"];
  let next = 0;
  let lastSchedulerTickAt = 0;

  return async () => {
    if (options.role === "primary") {
      try {
        const now = Date.now();
        const internalDue = options.scheduler.internalEnabled && now - lastSchedulerTickAt >= options.scheduler.intervalMs;
        if (internalDue || await options.scheduler.hasPendingTick()) {
          await options.scheduler.schedule();
          lastSchedulerTickAt = now;
        }
      } catch (error) {
        await options.onError("digestScheduler", error);
      }
    }

    for (let checked = 0; checked < order.length; checked++) {
      const workClass = order[next];
      // Advance before awaiting so an empty or failed category cannot retain priority.
      next = (next + 1) % order.length;
      try {
        if (await options.processors[workClass]()) {
          return true;
        }
      } catch (error) {
        await options.onError(workClass, error);
      }
    }
    return false;
  };
}
