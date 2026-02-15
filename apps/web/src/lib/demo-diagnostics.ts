export type DemoExtractionLogEntry = {
  at: string;
  stage: string;
  message: string;
  details?: Record<string, unknown>;
};

export type DemoExtractionDiagnostic = {
  id: string;
  itemId: string;
  itemTitle: string | null;
  sourceType: string;
  sourceUrl: string | null;
  sourceLabel: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  extractedText: string;
  extractedMarkdown: string | null;
  logEntries: DemoExtractionLogEntry[];
};

export function normalizeExtractionLogEntries(input: unknown): DemoExtractionLogEntry[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const normalized: DemoExtractionLogEntry[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const at = typeof candidate.at === "string" ? candidate.at : null;
    const stage = typeof candidate.stage === "string" ? candidate.stage : null;
    const message = typeof candidate.message === "string" ? candidate.message : null;
    if (!at || !stage || !message) {
      continue;
    }

    const detailsValue = candidate.details;
    const details =
      detailsValue && typeof detailsValue === "object" && !Array.isArray(detailsValue)
        ? (detailsValue as Record<string, unknown>)
        : undefined;

    normalized.push({
      at,
      stage,
      message,
      details
    });
  }

  return normalized;
}
