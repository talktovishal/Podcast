import { ProxySummaryProvider, StubSummaryProvider, type SummaryProvider } from "@articlepod/core";
import { workerEnv } from "./env.js";

let cachedProvider: SummaryProvider | null = null;

export function makeSummaryProvider(): SummaryProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  if (workerEnv.digestSummaryProvider === "proxy" && workerEnv.digestSummaryProxyUrl) {
    cachedProvider = new ProxySummaryProvider({
      baseUrl: workerEnv.digestSummaryProxyUrl,
      timeoutMs: workerEnv.digestSummaryTimeoutMs,
      providerLabel: "proxy"
    });
    return cachedProvider;
  }

  cachedProvider = new StubSummaryProvider();
  return cachedProvider;
}

export function resetSummaryProviderForTests(): void {
  cachedProvider = null;
}
