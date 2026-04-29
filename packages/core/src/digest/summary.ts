import { AppError, errorCodes } from "../errors/codes";
import { summaryMarkdownToNarrationText } from "../extract/markdownCleanup";
import type { DigestCadence, DigestLengthMinutes } from "../types/domain";

export type SummaryGenerationKind = "digest" | "summary_studio" | "item_summary";

export type DigestSummarySource = {
  itemId: string;
  title: string | null;
  sourceType: "URL" | "PDF" | "HTML_SNAPSHOT";
  sourceUrl: string | null;
  createdAt: Date;
  markdown: string;
};

export type DigestSummaryRequest = {
  kind?: SummaryGenerationKind;
  cadence: DigestCadence;
  timezone: string;
  periodKey: string;
  windowStart: Date;
  windowEnd: Date;
  targetLengthMinutes: DigestLengthMinutes;
  targetWords: number;
  requestedTitle?: string | null;
  sources: DigestSummarySource[];
};

export type DigestSummaryResponse = {
  title: string;
  markdown: string;
  plainText: string;
  provider: string;
  model: string;
  deployment?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

export interface SummaryProvider {
  summarize(input: DigestSummaryRequest): Promise<DigestSummaryResponse>;
}

export function normalizeSummarySnippet(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+[.)]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function summaryMarkdownToPlainText(markdown: string): string {
  return summaryMarkdownToNarrationText(markdown);
}

function cadenceLabel(cadence: DigestCadence): string {
  return cadence === "DAILY" ? "Daily" : "Weekly";
}

function sourceLabel(sourceType: DigestSummarySource["sourceType"]): string {
  switch (sourceType) {
    case "URL":
      return "URL";
    case "PDF":
      return "PDF";
    case "HTML_SNAPSHOT":
      return "Chrome extension";
    default:
      return sourceType;
  }
}

export function stableSummarySourceSort(a: DigestSummarySource, b: DigestSummarySource): number {
  const dateDiff = b.createdAt.getTime() - a.createdAt.getTime();
  if (dateDiff !== 0) {
    return dateDiff;
  }
  return a.itemId.localeCompare(b.itemId);
}

function fallbackTitle(input: DigestSummaryRequest): string {
  if (input.requestedTitle?.trim()) {
    return input.requestedTitle.trim();
  }
  if (input.kind === "summary_studio") {
    return `Summary Studio - ${input.periodKey}`;
  }
  if (input.kind === "item_summary") {
    return input.sources[0]?.title?.trim() || `Article summary - ${input.periodKey}`;
  }
  return `${cadenceLabel(input.cadence)} Digest - ${input.periodKey}`;
}

export class StubSummaryProvider implements SummaryProvider {
  async summarize(input: DigestSummaryRequest): Promise<DigestSummaryResponse> {
    const sorted = [...input.sources].sort(stableSummarySourceSort);
    const maxChars = Math.max(800, input.targetWords * 6);
    const lines: string[] = [];

    for (const source of sorted) {
      const normalizedTitle = source.title?.trim() || "Untitled";
      const snippet = normalizeSummarySnippet(source.markdown).slice(0, 240);
      if (!snippet) {
        continue;
      }

      const line = `- [${sourceLabel(source.sourceType)}] ${normalizedTitle}: ${snippet}`;
      if (lines.join("\n").length + line.length > maxChars) {
        break;
      }
      lines.push(line);
    }

    const title = fallbackTitle(input);
    const heading = `# ${title}`;
    const intro = `Generated from ${sorted.length} source item(s), target length ${input.targetLengthMinutes} minutes (${input.targetWords} words).`;
    const markdown =
      input.kind === "item_summary"
        ? [
            heading,
            "",
            sorted[0]
              ? `Generated from ${sourceLabel(sorted[0].sourceType)} source item "${sorted[0].title?.trim() || "Untitled"}".`
              : intro,
            "",
            "## Key points",
            "",
            ...(lines.length > 0 ? lines : ["- No source summary found."]),
            "",
            "## Why it matters",
            "",
            "- This placeholder summary uses the deterministic stub provider."
          ].join("\n")
        : input.kind === "summary_studio"
        ? [
            heading,
            "",
            intro,
            "",
            "## Key themes",
            "",
            ...(lines.length > 0 ? lines : ["- No source summaries found."]),
            "",
            "## Why it matters",
            "",
            "- This placeholder summary uses the deterministic stub provider."
          ].join("\n")
        : [heading, "", intro, "", "## Key updates", "", ...(lines.length > 0 ? lines : ["- No source summaries found."])].join("\n");

    return {
      title,
      markdown,
      plainText: summaryMarkdownToPlainText(markdown),
      provider: "stub",
      model: "stub-deterministic-v1",
      deployment: null,
      inputTokens: null,
      outputTokens: null
    };
  }
}

export class ProxySummaryProvider implements SummaryProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly providerLabel: string;

  constructor(input: { baseUrl: string; timeoutMs?: number; providerLabel?: string }) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = input.timeoutMs ?? 30_000;
    this.providerLabel = input.providerLabel ?? "proxy";
  }

  async summarize(input: DigestSummaryRequest): Promise<DigestSummaryResponse> {
    const response = await fetch(`${this.baseUrl}/v1/digest/summarize`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify(input)
    }).catch((error) => {
      throw new AppError(
        errorCodes.EXTRACTION_FAILED,
        error instanceof Error ? error.message : "Digest summary provider request failed.",
        502
      );
    });

    if (!response.ok) {
      throw new AppError(errorCodes.EXTRACTION_FAILED, `Digest summary provider returned ${response.status}.`, 502);
    }

    const parsed = (await response.json()) as Partial<DigestSummaryResponse>;
    const title = parsed.title?.trim() || fallbackTitle(input);
    const markdown = parsed.markdown?.trim() || "";
    if (!markdown) {
      throw new AppError(errorCodes.EXTRACTION_EMPTY, "Digest summary provider returned empty content.", 502);
    }

    return {
      title,
      markdown,
      plainText: summaryMarkdownToPlainText(markdown) || parsed.plainText?.trim() || "",
      provider: parsed.provider?.trim() || this.providerLabel,
      model: parsed.model?.trim() || "proxy",
      deployment: parsed.deployment?.trim() || null,
      inputTokens: parsed.inputTokens ?? null,
      outputTokens: parsed.outputTokens ?? null
    };
  }
}
