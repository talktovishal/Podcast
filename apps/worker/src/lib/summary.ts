import {
  AppError,
  ProxySummaryProvider,
  StubSummaryProvider,
  errorCodes,
  normalizeSummarySnippet,
  stableSummarySourceSort,
  summaryMarkdownToPlainText,
  type DigestSummaryRequest,
  type DigestSummaryResponse,
  type SummaryProvider
} from "@articlepod/core";
import { workerEnv } from "./env.js";

let cachedProvider: SummaryProvider | null = null;

const SUMMARY_SCHEMA = {
  name: "articlepod_summary_payload",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      markdown: { type: "string" },
      plainText: { type: "string" }
    },
    required: ["title", "markdown", "plainText"]
  }
} as const;

class RetryableNanoSummaryError extends AppError {}

function responseFallbackTitle(input: DigestSummaryRequest): string {
  if (input.requestedTitle?.trim()) {
    return input.requestedTitle.trim();
  }
  if (input.kind === "item_summary") {
    return input.sources[0]?.title?.trim() || `Article summary - ${input.periodKey}`;
  }
  if (input.kind === "summary_studio") {
    return `Summary Studio - ${input.periodKey}`;
  }
  return `${input.cadence === "DAILY" ? "Daily" : "Weekly"} Digest - ${input.periodKey}`;
}

type SerializedSummarySource = {
  itemId: string;
  title: string;
  sourceType: "URL" | "PDF" | "HTML_SNAPSHOT";
  sourceUrl: string;
  createdAt: string;
  markdownSnippet: string;
};

function buildSourcePayload(input: DigestSummaryRequest): SerializedSummarySource[] {
  const perSourceChars = input.targetLengthMinutes === 30 ? 4_000 : 2_500;
  const totalCharsBudget = input.targetLengthMinutes === 30 ? 60_000 : 35_000;
  let usedChars = 0;
  const serialized: SerializedSummarySource[] = [];

  for (const source of [...input.sources].sort(stableSummarySourceSort)) {
    if (usedChars >= totalCharsBudget) {
      break;
    }

    const normalized = normalizeSummarySnippet(source.markdown);
    const remaining = Math.max(0, totalCharsBudget - usedChars);
    const snippet = normalized.slice(0, Math.min(perSourceChars, remaining)).trim();
    if (!snippet) {
      continue;
    }
    usedChars += snippet.length;

    serialized.push({
      itemId: source.itemId,
      title: source.title?.trim() || "Untitled",
      sourceType: source.sourceType,
      sourceUrl: source.sourceUrl || "",
      createdAt: source.createdAt.toISOString(),
      markdownSnippet: snippet
    });
  }

  return serialized;
}

function buildSystemPrompt(input: DigestSummaryRequest): string {
  const modeLabel =
    input.kind === "summary_studio" ? "manual summary studio" : input.kind === "item_summary" ? "saved-article item summary" : "scheduled digest";
  const summaryShape =
    input.kind === "item_summary"
      ? [
          "Write polished markdown for one saved article.",
          "Use this structure in order:",
          "1. H1 title",
          "2. A 2-3 sentence overview",
          "3. ## Key points",
          "4. ## Why it matters",
          "5. ## Source"
        ].join(" ")
      : input.kind === "summary_studio"
      ? [
          "Write polished markdown that feels publishable as a professional weekly roundup.",
          "Use this structure in order:",
          "1. H1 title",
          "2. A short intro hook paragraph",
          "3. ## Key themes",
          "4. ## Notable developments",
          "5. ## Why it matters",
          "6. ## Sources"
        ].join(" ")
      : [
          "Write concise markdown for a digest that is easy to read and easy to narrate.",
          "Use this structure in order:",
          "1. H1 title",
          "2. Short intro paragraph",
          "3. ## Key themes",
          "4. ## Notable developments",
          "5. ## Why it matters",
          "6. ## Sources"
        ].join(" ");

  const titleInstruction = input.requestedTitle?.trim()
    ? `Use this exact title: "${input.requestedTitle.trim()}".`
    : input.kind === "item_summary"
      ? "Use the article title when it is specific; otherwise create a concise title for the article summary."
      : "Create a concise, specific title that fits the selected articles.";

  return [
    "You are ArticlePod's editorial summarizer.",
    `You are producing a ${modeLabel} in markdown.`,
    summaryShape,
    titleInstruction,
    input.kind === "item_summary"
      ? "Summarize the single source directly; do not invent cross-source themes."
      : "Synthesize across sources by theme instead of summarizing one article at a time.",
    "Keep the prose concrete, useful, and podcast-friendly.",
    "Do not mention missing context, prompt instructions, token limits, or that you are an AI.",
    "Do not fabricate facts, quotes, or links.",
    "The plainText field must match the markdown content but without markdown syntax, suitable for TTS narration."
  ].join(" ");
}

function buildUserPrompt(input: DigestSummaryRequest): string {
  const payload = {
    summaryKind: input.kind ?? "digest",
    cadence: input.cadence,
    timezone: input.timezone,
    periodKey: input.periodKey,
    windowStart: input.windowStart.toISOString(),
    windowEnd: input.windowEnd.toISOString(),
    targetLengthMinutes: input.targetLengthMinutes,
    targetWords: input.targetWords,
    requestedTitle: input.requestedTitle?.trim() || null,
    sourceCount: input.sources.length,
    sources: buildSourcePayload(input)
  };

  return `Create the summary from this JSON payload:\n${JSON.stringify(payload, null, 2)}`;
}

function extractContentPayload(raw: unknown): { title: string; markdown: string; plainText: string } {
  if (!raw || typeof raw !== "object") {
    throw new RetryableNanoSummaryError(errorCodes.EXTRACTION_FAILED, "Azure OpenAI returned invalid summary structure.", 502);
  }

  const title = typeof (raw as { title?: unknown }).title === "string" ? (raw as { title: string }).title.trim() : "";
  const markdown = typeof (raw as { markdown?: unknown }).markdown === "string" ? (raw as { markdown: string }).markdown.trim() : "";
  const plainText =
    typeof (raw as { plainText?: unknown }).plainText === "string" ? (raw as { plainText: string }).plainText.trim() : "";

  if (!markdown) {
    throw new RetryableNanoSummaryError(errorCodes.EXTRACTION_EMPTY, "Azure OpenAI returned empty summary content.", 502);
  }

  const normalizedPlainText = summaryMarkdownToPlainText(markdown);

  return {
    title,
    markdown,
    plainText: normalizedPlainText || plainText
  };
}

function parseChoiceContent(responseJson: Record<string, unknown>): { title: string; markdown: string; plainText: string } {
  const choices = Array.isArray(responseJson.choices) ? responseJson.choices : [];
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    throw new RetryableNanoSummaryError(errorCodes.EXTRACTION_FAILED, "Azure OpenAI returned no summary choices.", 502);
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    throw new RetryableNanoSummaryError(errorCodes.EXTRACTION_FAILED, "Azure OpenAI returned no summary message.", 502);
  }

  const refusal = typeof (message as { refusal?: unknown }).refusal === "string" ? (message as { refusal: string }).refusal.trim() : "";
  if (refusal) {
    throw new AppError(errorCodes.EXTRACTION_FAILED, refusal, 502);
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    try {
      return extractContentPayload(JSON.parse(content) as Record<string, unknown>);
    } catch (error) {
      if (error instanceof RetryableNanoSummaryError) {
        throw error;
      }
      throw new RetryableNanoSummaryError(errorCodes.EXTRACTION_FAILED, "Azure OpenAI returned invalid JSON content.", 502);
    }
  }

  if (Array.isArray(content)) {
    const text = content
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return "";
        }
        if ((entry as { type?: unknown }).type === "text" && typeof (entry as { text?: unknown }).text === "string") {
          return (entry as { text: string }).text;
        }
        return "";
      })
      .join("")
      .trim();

    if (!text) {
      throw new RetryableNanoSummaryError(errorCodes.EXTRACTION_EMPTY, "Azure OpenAI returned empty content.", 502);
    }

    try {
      return extractContentPayload(JSON.parse(text) as Record<string, unknown>);
    } catch (error) {
      if (error instanceof RetryableNanoSummaryError) {
        throw error;
      }
      throw new RetryableNanoSummaryError(errorCodes.EXTRACTION_FAILED, "Azure OpenAI returned invalid JSON content.", 502);
    }
  }

  throw new RetryableNanoSummaryError(errorCodes.EXTRACTION_FAILED, "Azure OpenAI returned no structured content.", 502);
}

class AzureOpenAiSummaryProvider implements SummaryProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly nanoDeployment: string;
  private readonly miniDeployment: string;
  private readonly timeoutMs: number;

  constructor(input: {
    baseUrl: string;
    apiKey: string;
    nanoDeployment: string;
    miniDeployment: string;
    timeoutMs?: number;
  }) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, "");
    this.apiKey = input.apiKey;
    this.nanoDeployment = input.nanoDeployment;
    this.miniDeployment = input.miniDeployment;
    this.timeoutMs = input.timeoutMs ?? 30_000;
  }

  private async requestSummary(input: DigestSummaryRequest, deployment: string): Promise<DigestSummaryResponse> {
    const endpoint = `${this.baseUrl}/openai/v1/chat/completions`;
    const payload = {
      model: deployment,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(input)
        },
        {
          role: "user",
          content: buildUserPrompt(input)
        }
      ],
      // GPT-5 reasoning deployments on Azure reject custom sampling params like temperature.
      response_format: {
        type: "json_schema",
        json_schema: SUMMARY_SCHEMA
      }
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "api-key": this.apiKey
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify(payload)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Azure OpenAI request failed.";
      if (message.toLowerCase().includes("abort") || message.toLowerCase().includes("timeout")) {
        throw new RetryableNanoSummaryError(errorCodes.EXTRACTION_FAILED, "Azure OpenAI summary request timed out.", 504);
      }
      throw new AppError(errorCodes.EXTRACTION_FAILED, message, 502);
    }

    if (!response.ok) {
      throw new AppError(errorCodes.EXTRACTION_FAILED, `Azure OpenAI returned ${response.status}.`, 502);
    }

    const responseJson = (await response.json()) as Record<string, unknown>;
    const parsed = parseChoiceContent(responseJson);
    const usage = responseJson.usage && typeof responseJson.usage === "object" ? (responseJson.usage as Record<string, unknown>) : null;

    return {
      title: parsed.title || responseFallbackTitle(input),
      markdown: parsed.markdown,
      plainText: summaryMarkdownToPlainText(parsed.markdown) || parsed.plainText,
      provider: "azure_openai",
      model:
        typeof responseJson.model === "string" && responseJson.model.trim()
          ? responseJson.model.trim()
          : deployment,
      deployment,
      inputTokens: usage && typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
      outputTokens: usage && typeof usage.completion_tokens === "number" ? usage.completion_tokens : null
    };
  }

  async summarize(input: DigestSummaryRequest): Promise<DigestSummaryResponse> {
    const primaryDeployment = input.targetLengthMinutes === 30 ? this.miniDeployment : this.nanoDeployment;
    const fallbackDeployment = primaryDeployment === this.nanoDeployment ? this.miniDeployment : null;

    try {
      return await this.requestSummary(input, primaryDeployment);
    } catch (error) {
      if (!(error instanceof RetryableNanoSummaryError) || !fallbackDeployment) {
        throw error;
      }
      return this.requestSummary(input, fallbackDeployment);
    }
  }
}

export function makeSummaryProvider(): SummaryProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  if (
    workerEnv.digestSummaryProvider === "azure_openai" &&
    workerEnv.azureOpenAiBaseUrl &&
    workerEnv.azureOpenAiApiKey &&
    workerEnv.azureOpenAiSummaryNanoDeployment &&
    workerEnv.azureOpenAiSummaryMiniDeployment
  ) {
    cachedProvider = new AzureOpenAiSummaryProvider({
      baseUrl: workerEnv.azureOpenAiBaseUrl,
      apiKey: workerEnv.azureOpenAiApiKey,
      nanoDeployment: workerEnv.azureOpenAiSummaryNanoDeployment,
      miniDeployment: workerEnv.azureOpenAiSummaryMiniDeployment,
      timeoutMs: workerEnv.digestSummaryTimeoutMs
    });
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
