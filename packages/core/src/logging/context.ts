import { AsyncLocalStorage } from "node:async_hooks";
import type { LogContext } from "./types";

const storage = new AsyncLocalStorage<LogContext>();

export function withLogContext<T>(ctx: LogContext, fn: () => T): T {
  const merged = { ...storage.getStore(), ...ctx };
  return storage.run(merged, fn);
}

export function getLogContext(): LogContext {
  return storage.getStore() ?? {};
}

