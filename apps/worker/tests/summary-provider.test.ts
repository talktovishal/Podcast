import assert from "node:assert/strict";
import test from "node:test";
import { makeSummaryProvider, resetSummaryProviderForTests } from "../src/lib/summary.js";
import { workerEnv } from "../src/lib/env.js";

const originalFetch = globalThis.fetch;

function validAzureResponse(input: { title?: string; markdown?: string; plainText?: string; model?: string }) {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      model: input.model ?? "gpt-5-nano",
      usage: {
        prompt_tokens: 123,
        completion_tokens: 45
      },
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: input.title ?? "Summary title",
              markdown: input.markdown ?? "# Summary title\n\n## Key themes\n\n- One",
              plainText: input.plainText ?? "Summary title. Key themes. One."
            })
          }
        }
      ]
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    }
  );
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  workerEnv.digestSummaryProvider = "stub";
  workerEnv.azureOpenAiBaseUrl = undefined;
  workerEnv.azureOpenAiApiKey = undefined;
  workerEnv.azureOpenAiSummaryNanoDeployment = "digest-summary-nano";
  workerEnv.azureOpenAiSummaryMiniDeployment = "digest-summary-mini";
  resetSummaryProviderForTests();
});

test("azure summary provider routes 15-minute summaries to nano deployment", async () => {
  const seenBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    seenBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return validAzureResponse({ model: "gpt-5-nano" });
  };

  workerEnv.digestSummaryProvider = "azure_openai";
  workerEnv.azureOpenAiBaseUrl = "https://example.openai.azure.com";
  workerEnv.azureOpenAiApiKey = "test-key";
  resetSummaryProviderForTests();

  const provider = makeSummaryProvider();
  const summary = await provider.summarize({
    kind: "summary_studio",
    cadence: "WEEKLY",
    timezone: "UTC",
    periodKey: "2026-03-21_demo",
    windowStart: new Date("2026-03-14T00:00:00.000Z"),
    windowEnd: new Date("2026-03-21T00:00:00.000Z"),
    targetLengthMinutes: 15,
    targetWords: 2100,
    requestedTitle: "My Weekly Summary",
    sources: [
      {
        itemId: "item-1",
        title: "Item one",
        sourceType: "URL",
        sourceUrl: "https://example.com/1",
        createdAt: new Date("2026-03-20T00:00:00.000Z"),
        markdown: "# Item one\n\nInteresting details"
      }
    ]
  });

  assert.equal(seenBodies.length, 1);
  assert.equal(seenBodies[0]?.model, "digest-summary-nano");
  assert.equal("temperature" in (seenBodies[0] ?? {}), false);
  assert.equal((seenBodies[0]?.response_format as { type?: string }).type, "json_schema");
  assert.equal(summary.deployment, "digest-summary-nano");
  assert.equal(summary.inputTokens, 123);
  assert.equal(summary.outputTokens, 45);
});

test("azure summary provider routes 30-minute summaries to mini deployment", async () => {
  const seenBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_input, init) => {
    seenBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return validAzureResponse({ model: "gpt-5-mini" });
  };

  workerEnv.digestSummaryProvider = "azure_openai";
  workerEnv.azureOpenAiBaseUrl = "https://example.openai.azure.com";
  workerEnv.azureOpenAiApiKey = "test-key";
  resetSummaryProviderForTests();

  const provider = makeSummaryProvider();
  const summary = await provider.summarize({
    kind: "summary_studio",
    cadence: "WEEKLY",
    timezone: "UTC",
    periodKey: "2026-03-21_demo",
    windowStart: new Date("2026-03-14T00:00:00.000Z"),
    windowEnd: new Date("2026-03-21T00:00:00.000Z"),
    targetLengthMinutes: 30,
    targetWords: 4200,
    requestedTitle: null,
    sources: [
      {
        itemId: "item-1",
        title: "Item one",
        sourceType: "URL",
        sourceUrl: "https://example.com/1",
        createdAt: new Date("2026-03-20T00:00:00.000Z"),
        markdown: "# Item one\n\nInteresting details"
      }
    ]
  });

  assert.equal(seenBodies.length, 1);
  assert.equal(seenBodies[0]?.model, "digest-summary-mini");
  assert.equal("temperature" in (seenBodies[0] ?? {}), false);
  assert.equal(summary.deployment, "digest-summary-mini");
});

test("azure summary provider retries nano failures once on mini", async () => {
  const seenModels: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    seenModels.push(body.model);
    if (body.model === "digest-summary-nano") {
      return new Response(
        JSON.stringify({
          model: "gpt-5-nano",
          usage: {
            prompt_tokens: 100,
            completion_tokens: 10
          },
          choices: [{ message: { content: JSON.stringify({ title: "Bad", markdown: "", plainText: "" }) } }]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
    }
    return validAzureResponse({ model: "gpt-5-mini", title: "Fallback summary" });
  };

  workerEnv.digestSummaryProvider = "azure_openai";
  workerEnv.azureOpenAiBaseUrl = "https://example.openai.azure.com";
  workerEnv.azureOpenAiApiKey = "test-key";
  resetSummaryProviderForTests();

  const provider = makeSummaryProvider();
  const summary = await provider.summarize({
    kind: "summary_studio",
    cadence: "WEEKLY",
    timezone: "UTC",
    periodKey: "2026-03-21_demo",
    windowStart: new Date("2026-03-14T00:00:00.000Z"),
    windowEnd: new Date("2026-03-21T00:00:00.000Z"),
    targetLengthMinutes: 5,
    targetWords: 700,
    requestedTitle: null,
    sources: [
      {
        itemId: "item-1",
        title: "Item one",
        sourceType: "URL",
        sourceUrl: "https://example.com/1",
        createdAt: new Date("2026-03-20T00:00:00.000Z"),
        markdown: "# Item one\n\nInteresting details"
      }
    ]
  });

  assert.deepEqual(seenModels, ["digest-summary-nano", "digest-summary-mini"]);
  assert.equal(summary.title, "Fallback summary");
  assert.equal(summary.deployment, "digest-summary-mini");
});

test("azure summary provider derives plainText from markdown instead of trusting noisy source appendices", async () => {
  globalThis.fetch = async () =>
    validAzureResponse({
      markdown: `# Summary title

This body paragraph is the part we want narrated from the stored summary markdown.

## Sources

- [Research note](https://example.com/research-note)
- https://cdn.example.com/chart.png`,
      plainText: "Summary title. This body paragraph is the part we want narrated from the stored summary markdown. Sources. https://example.com/research-note"
    });

  workerEnv.digestSummaryProvider = "azure_openai";
  workerEnv.azureOpenAiBaseUrl = "https://example.openai.azure.com";
  workerEnv.azureOpenAiApiKey = "test-key";
  resetSummaryProviderForTests();

  const provider = makeSummaryProvider();
  const summary = await provider.summarize({
    kind: "summary_studio",
    cadence: "WEEKLY",
    timezone: "UTC",
    periodKey: "2026-03-21_demo",
    windowStart: new Date("2026-03-14T00:00:00.000Z"),
    windowEnd: new Date("2026-03-21T00:00:00.000Z"),
    targetLengthMinutes: 15,
    targetWords: 2100,
    requestedTitle: "My Weekly Summary",
    sources: [
      {
        itemId: "item-1",
        title: "Item one",
        sourceType: "URL",
        sourceUrl: "https://example.com/1",
        createdAt: new Date("2026-03-20T00:00:00.000Z"),
        markdown: "# Item one\n\nInteresting details"
      }
    ]
  });

  assert.ok(summary.plainText.includes("This body paragraph is the part we want narrated"));
  assert.ok(!summary.plainText.includes("Sources"));
  assert.ok(!summary.plainText.includes("example.com/research-note"));
  assert.ok(!summary.plainText.includes("cdn.example.com"));
});
