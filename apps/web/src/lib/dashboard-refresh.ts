export function createDashboardRefresh() {
  let generation = 0;
  let active: AbortController | null = null;

  const invalidate = () => {
    generation++;
    active?.abort();
    active = null;
  };

  return {
    invalidate,
    async run<T>(
      load: (signal: AbortSignal) => Promise<T>,
      apply: (value: T, isCurrent: () => boolean) => void,
      onError: (error: unknown) => void
    ): Promise<void> {
      if (active) {
        return;
      }
      const controller = new AbortController();
      active = controller;
      const requestGeneration = ++generation;
      const isCurrent = () => generation === requestGeneration && !controller.signal.aborted;
      try {
        const value = await load(controller.signal);
        if (isCurrent()) {
          apply(value, isCurrent);
        }
      } catch (error) {
        if (isCurrent()) {
          onError(error);
        }
      } finally {
        if (active === controller) {
          active = null;
        }
      }
    }
  };
}
