import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import http from "node:http";
import {
  BLOCKED_PAGE_HTML_SNAPSHOT_MESSAGE,
  BLOCKED_SITE_HTML_SNAPSHOT_MESSAGE,
  extractHtmlFromUrl,
  extractHtmlFromUrlWithDiagnostics,
  extractHtmlSnapshot,
  shouldSuggestHtmlSnapshotForError
} from "../src/extract/html";
import { cleanPdfTextWithAbogenRules } from "../src/extract/abogen/pdfClean";
import { cleanExtractedMarkdown } from "../src/extract/markdownCleanup";
import { extractTextFromPdf } from "../src/extract/pdf";
import { AppError, errorCodes } from "../src/errors/codes";

function makeMockResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body
  } as unknown as Response;
}

test("extractHtmlFromUrl extracts fixture", async () => {
  const html = await readFile(new URL("../../../fixtures/html/article.html", import.meta.url), "utf-8");
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      text: async () => html
    }) as unknown as Response) as typeof fetch;

  const result = await extractHtmlFromUrl("https://example.com/article");
  assert.ok(result.text.length > 100);
  assert.ok(result.markdown.length > 80);
  assert.ok(result.rawHtml.includes("<html"));
  assert.ok(result.title.includes("Fixture"));

  globalThis.fetch = originalFetch;
});

test("extractHtmlFromUrl applies abogen cleaner pipeline", async () => {
  const noisyHtml = `
    <html>
      <head><title>Cleaner Fixture</title></head>
      <body>
        <article>
          <h1>Cleaner Fixture</h1>
          <p>This article has enough text to pass extraction minimums and stay deterministic for tests.</p>
          <figure>
            <img alt="Demo image" src="https://example.com/example.png" />
            <figcaption>Image caption noise that should not be narrated.</figcaption>
          </figure>
          <ol>
            <li>First ordered item with stable wording.</li>
            <li>Second ordered item with stable wording.</li>
          </ol>
          <p>Footnote marker gets stripped from text<sup>1</sup> so narration stays clean.</p>
          <p>This final paragraph adds more stable words so the extracted output remains over minimum length.</p>
        </article>
      </body>
    </html>
  `;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      text: async () => noisyHtml
    }) as unknown as Response) as typeof fetch;

  const result = await extractHtmlFromUrl("https://example.com/cleaner");
  assert.equal(result.title, "Cleaner Fixture");
  assert.ok(result.markdown.length > 80);
  assert.ok(!result.text.toLowerCase().includes("image caption noise"));
  assert.ok(result.text.includes("1) First ordered item with stable wording."));
  assert.ok(!result.text.includes("Footnote marker gets stripped from text1"));

  globalThis.fetch = originalFetch;
});

test("extractHtmlSnapshot flattens table-heavy markup into markdown instead of preserving raw html", () => {
  const html = `
    <!doctype html>
    <html>
      <head><title>Hacker News-style listing</title></head>
      <body>
        <main>
          <table>
            <tbody>
              <tr>
                <td><span>1.</span></td>
                <td>
                  <span>
                    <a href="https://example.com/story">Story title</a>
                    <span>(<a href="https://news.ycombinator.com/from?site=example.com">example.com</a>)</span>
                  </span>
                </td>
              </tr>
              <tr>
                <td colspan="2">
                  <span>437 points by <a href="https://news.ycombinator.com/user?id=alice">alice</a> <a href="https://news.ycombinator.com/item?id=1">6 hours ago</a> | <a href="https://news.ycombinator.com/item?id=1">126 comments</a></span>
                </td>
              </tr>
              <tr>
                <td><span>2.</span></td>
                <td>
                  <span>
                    <a href="https://example.com/second-story">Second story with enough descriptive words to stay stable in this extraction regression test</a>
                    <span>(<a href="https://news.ycombinator.com/from?site=example.com">example.com</a>)</span>
                  </span>
                </td>
              </tr>
              <tr>
                <td colspan="2">
                  <span>128 points by <a href="https://news.ycombinator.com/user?id=bob">bob</a> <a href="https://news.ycombinator.com/item?id=2">3 hours ago</a> | <a href="https://news.ycombinator.com/item?id=2">42 comments</a></span>
                </td>
              </tr>
              <tr>
                <td><a href="https://news.ycombinator.com/?p=2" rel="next">More</a></td>
              </tr>
            </tbody>
          </table>
        </main>
      </body>
    </html>
  `;

  const result = extractHtmlSnapshot({
    html,
    url: "https://news.ycombinator.com/news"
  });
  const cleaned = cleanExtractedMarkdown(result.markdown);

  assert.ok(!result.markdown.includes("<table"));
  assert.ok(!result.markdown.includes("href="));
  assert.match(cleaned, /Story title \(example\.com\)/);
  assert.match(cleaned, /Second story with enough descriptive words/);
  assert.ok(!cleaned.includes("https://"));
});

test("extractHtmlFromUrl maps 403 to actionable extraction error", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 403,
      text: async () => ""
    }) as unknown as Response) as typeof fetch;

  await assert.rejects(
    () => extractHtmlFromUrl("https://example.com/blocked"),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === errorCodes.EXTRACTION_FAILED &&
      error.userMessage.toLowerCase().includes("blocked access")
  );

  globalThis.fetch = originalFetch;
});

test("extractHtmlFromUrl maps network timeout to actionable extraction error", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    const err = new Error("fetch failed");
    (err as Error & { cause?: { code?: string } }).cause = { code: "UND_ERR_HEADERS_TIMEOUT" };
    throw err;
  }) as typeof fetch;

  await assert.rejects(
    () => extractHtmlFromUrl("https://example.com/timeout"),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === errorCodes.EXTRACTION_FAILED &&
      error.userMessage.toLowerCase().includes("timed out")
  );

  globalThis.fetch = originalFetch;
});

test("extractHtmlFromUrl maps unreachable host network to actionable extraction error", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw Object.assign(new Error("network unreachable"), { code: "ENETUNREACH" });
  }) as typeof fetch;

  await assert.rejects(
    () => extractHtmlFromUrl("https://example.com/unreachable"),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === errorCodes.EXTRACTION_FAILED &&
      error.userMessage.toLowerCase().includes("cannot currently reach")
  );

  globalThis.fetch = originalFetch;
});

test("extractHtmlFromUrl maps invalid pinned IP errors to actionable extraction error", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw Object.assign(new Error("Invalid IP address"), { code: "ERR_INVALID_IP_ADDRESS" });
  }) as typeof fetch;

  await assert.rejects(
    () => extractHtmlFromUrl("https://example.com/invalid-ip"),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === errorCodes.EXTRACTION_FAILED &&
      error.userMessage.toLowerCase().includes("could not connect")
  );

  globalThis.fetch = originalFetch;
});

test("extractHtmlFromUrl classifies lightweight challenge pages as blocked-site failures with extension guidance", async () => {
  const originalFetch = globalThis.fetch;
  let caught: unknown = null;

  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      text: async () => `
        <!doctype html>
        <html>
          <head><title>Verifying...</title></head>
          <body>
            <main id="cf-wrapper">
              <h1>Verifying...</h1>
              <p>Please wait while we verify your browser.</p>
              <p>Performance & security by Cloudflare</p>
            </main>
            <script src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/orchestrate/jsch/v1"></script>
          </body>
        </html>
      `
    }) as unknown as Response) as typeof fetch;

  await assert.rejects(
    () => extractHtmlFromUrl("https://openai.com/index/introducing-gpt-5"),
    (error: unknown) => {
      caught = error;
      return (
        error instanceof AppError &&
        error.code === errorCodes.EXTRACTION_FAILED &&
        error.userMessage === BLOCKED_SITE_HTML_SNAPSHOT_MESSAGE
      );
    }
  );
  assert.equal(shouldSuggestHtmlSnapshotForError(caught), true);

  globalThis.fetch = originalFetch;
});

test("extractHtmlFromUrl retries pinned IP candidates and succeeds on a reachable fallback", async () => {
  const html = await readFile(new URL("../../../fixtures/html/article.html", import.meta.url), "utf-8");
  const originalRequest = http.request;
  const originalFetch = globalThis.fetch;
  let requestCalls = 0;
  let fallbackCalls = 0;

  globalThis.fetch = (async () => {
    fallbackCalls += 1;
    throw new Error("unexpected hostname fallback");
  }) as typeof fetch;

  http.request = ((...args: unknown[]) => {
    requestCalls += 1;
    const callback =
      typeof args[1] === "function"
        ? (args[1] as (response: EventEmitter & { statusCode?: number }) => void)
        : typeof args[2] === "function"
          ? (args[2] as (response: EventEmitter & { statusCode?: number }) => void)
          : null;

    const requestEmitter = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };

    requestEmitter.end = () => {
      if (requestCalls === 1) {
        process.nextTick(() => {
          requestEmitter.emit("error", Object.assign(new Error("connect refused"), { code: "ECONNREFUSED" }));
        });
        return;
      }

      const responseEmitter = new EventEmitter() as EventEmitter & { statusCode?: number };
      responseEmitter.statusCode = 200;
      process.nextTick(() => {
        callback?.(responseEmitter);
        responseEmitter.emit("data", Buffer.from(html, "utf8"));
        responseEmitter.emit("end");
      });
    };

    requestEmitter.destroy = (error?: Error) => {
      if (error) {
        process.nextTick(() => requestEmitter.emit("error", error));
      }
    };

    return requestEmitter as unknown as ReturnType<typeof http.request>;
  }) as typeof http.request;

  try {
    const result = await extractHtmlFromUrl("http://example.com/article", ["203.0.113.7", "198.51.100.9"]);
    assert.equal(requestCalls, 2);
    assert.equal(fallbackCalls, 0);
    assert.ok(result.text.length > 100);
    assert.ok(result.markdown.length > 80);
    assert.ok(result.title.length > 0);
  } finally {
    http.request = originalRequest;
    globalThis.fetch = originalFetch;
  }
});

test("extractHtmlFromUrl retries the next pinned candidate after a socket error", async () => {
  const html = await readFile(new URL("../../../fixtures/html/article.html", import.meta.url), "utf-8");
  const originalRequest = http.request;
  const originalFetch = globalThis.fetch;
  let requestCalls = 0;
  let fallbackCalls = 0;

  globalThis.fetch = (async () => {
    fallbackCalls += 1;
    throw new Error("unexpected hostname fallback");
  }) as typeof fetch;

  http.request = ((...args: unknown[]) => {
    requestCalls += 1;
    const callback =
      typeof args[1] === "function"
        ? (args[1] as (response: EventEmitter & { statusCode?: number }) => void)
        : typeof args[2] === "function"
          ? (args[2] as (response: EventEmitter & { statusCode?: number }) => void)
          : null;

    const requestEmitter = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };

    requestEmitter.end = () => {
      if (requestCalls === 1) {
        const socketEmitter = new EventEmitter();
        process.nextTick(() => {
          requestEmitter.emit("socket", socketEmitter);
          socketEmitter.emit("error", Object.assign(new Error("network unreachable"), { code: "ENETUNREACH" }));
        });
        return;
      }

      const responseEmitter = new EventEmitter() as EventEmitter & { statusCode?: number };
      responseEmitter.statusCode = 200;
      process.nextTick(() => {
        callback?.(responseEmitter);
        responseEmitter.emit("data", Buffer.from(html, "utf8"));
        responseEmitter.emit("end");
      });
    };

    requestEmitter.destroy = (error?: Error) => {
      if (error) {
        process.nextTick(() => requestEmitter.emit("error", error));
      }
    };

    return requestEmitter as unknown as ReturnType<typeof http.request>;
  }) as typeof http.request;

  try {
    const result = await extractHtmlFromUrlWithDiagnostics("http://example.com/article", ["2001:db8::1", "198.51.100.9"]);
    assert.equal(requestCalls, 2);
    assert.equal(fallbackCalls, 0);
    assert.equal(result.diagnostics.finalFetchStrategy, "pinned");
    assert.ok(result.text.length > 100);
  } finally {
    http.request = originalRequest;
    globalThis.fetch = originalFetch;
  }
});

test("extractHtmlFromUrl skips ipv6 pinned candidates in azure runtime profile", async () => {
  const html = await readFile(new URL("../../../fixtures/html/article.html", import.meta.url), "utf-8");
  const originalRequest = http.request;
  const originalFetch = globalThis.fetch;
  const previousRuntimeProfile = process.env.RUNTIME_PROFILE;
  const previousPinnedIpv6 = process.env.PINNED_FETCH_IPV6_ENABLED;
  let requestCalls = 0;
  const seenFamilies: Array<number | undefined> = [];

  process.env.RUNTIME_PROFILE = "azure";
  delete process.env.PINNED_FETCH_IPV6_ENABLED;
  globalThis.fetch = (async () => {
    throw new Error("unexpected hostname fallback");
  }) as typeof fetch;

  http.request = ((...args: unknown[]) => {
    requestCalls += 1;
    const options =
      (typeof args[0] === "object" && args[0] !== null ? args[0] : {}) as {
        family?: number;
      };
    seenFamilies.push(options.family);
    const callback =
      typeof args[1] === "function"
        ? (args[1] as (response: EventEmitter & { statusCode?: number }) => void)
        : typeof args[2] === "function"
          ? (args[2] as (response: EventEmitter & { statusCode?: number }) => void)
          : null;

    const requestEmitter = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };

    requestEmitter.end = () => {
      const responseEmitter = new EventEmitter() as EventEmitter & { statusCode?: number };
      responseEmitter.statusCode = 200;
      process.nextTick(() => {
        callback?.(responseEmitter);
        responseEmitter.emit("data", Buffer.from(html, "utf8"));
        responseEmitter.emit("end");
      });
    };

    requestEmitter.destroy = (error?: Error) => {
      if (error) {
        process.nextTick(() => requestEmitter.emit("error", error));
      }
    };

    return requestEmitter as unknown as ReturnType<typeof http.request>;
  }) as typeof http.request;

  try {
    const result = await extractHtmlFromUrlWithDiagnostics("http://example.com/article", ["2001:db8::1", "198.51.100.9"]);
    assert.equal(requestCalls, 1);
    assert.deepEqual(seenFamilies, [4]);
    assert.equal(result.diagnostics.pinnedCandidateCount, 1);
    assert.equal(result.diagnostics.finalFetchStrategy, "pinned");
    assert.ok(result.text.length > 100);
  } finally {
    http.request = originalRequest;
    globalThis.fetch = originalFetch;
    if (previousRuntimeProfile === undefined) {
      delete process.env.RUNTIME_PROFILE;
    } else {
      process.env.RUNTIME_PROFILE = previousRuntimeProfile;
    }
    if (previousPinnedIpv6 === undefined) {
      delete process.env.PINNED_FETCH_IPV6_ENABLED;
    } else {
      process.env.PINNED_FETCH_IPV6_ENABLED = previousPinnedIpv6;
    }
  }
});

test("extractHtmlFromUrl retries the next pinned candidate after a blocked response", async () => {
  const html = await readFile(new URL("../../../fixtures/html/article.html", import.meta.url), "utf-8");
  const originalRequest = http.request;
  const originalFetch = globalThis.fetch;
  let requestCalls = 0;
  let fallbackCalls = 0;

  globalThis.fetch = (async () => {
    fallbackCalls += 1;
    throw new Error("unexpected hostname fallback");
  }) as typeof fetch;

  http.request = ((...args: unknown[]) => {
    requestCalls += 1;
    const callback =
      typeof args[1] === "function"
        ? (args[1] as (response: EventEmitter & { statusCode?: number }) => void)
        : typeof args[2] === "function"
          ? (args[2] as (response: EventEmitter & { statusCode?: number }) => void)
          : null;

    const requestEmitter = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };

    requestEmitter.end = () => {
      const responseEmitter = new EventEmitter() as EventEmitter & { statusCode?: number };
      responseEmitter.statusCode = requestCalls === 1 ? 403 : 200;
      process.nextTick(() => {
        callback?.(responseEmitter);
        if (requestCalls > 1) {
          responseEmitter.emit("data", Buffer.from(html, "utf8"));
        }
        responseEmitter.emit("end");
      });
    };

    requestEmitter.destroy = (error?: Error) => {
      if (error) {
        process.nextTick(() => requestEmitter.emit("error", error));
      }
    };

    return requestEmitter as unknown as ReturnType<typeof http.request>;
  }) as typeof http.request;

  try {
    const result = await extractHtmlFromUrlWithDiagnostics("http://example.com/article", ["203.0.113.7", "198.51.100.9"]);
    assert.equal(requestCalls, 2);
    assert.equal(fallbackCalls, 0);
    assert.equal(result.diagnostics.finalFetchStrategy, "pinned");
    assert.deepEqual(result.diagnostics.pinnedStatuses, [403, 200]);
    assert.ok(result.text.length > 100);
  } finally {
    http.request = originalRequest;
    globalThis.fetch = originalFetch;
  }
});

test("extractHtmlFromUrl falls back to hostname fetch after pinned blocked responses", async () => {
  const html = await readFile(new URL("../../../fixtures/html/article.html", import.meta.url), "utf-8");
  const originalRequest = http.request;
  const originalFetch = globalThis.fetch;
  let requestCalls = 0;
  let fallbackCalls = 0;

  globalThis.fetch = (async () => {
    fallbackCalls += 1;
    return makeMockResponse(200, html);
  }) as typeof fetch;

  http.request = ((...args: unknown[]) => {
    requestCalls += 1;
    const callback =
      typeof args[1] === "function"
        ? (args[1] as (response: EventEmitter & { statusCode?: number }) => void)
        : typeof args[2] === "function"
          ? (args[2] as (response: EventEmitter & { statusCode?: number }) => void)
          : null;

    const requestEmitter = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };

    requestEmitter.end = () => {
      const responseEmitter = new EventEmitter() as EventEmitter & { statusCode?: number };
      responseEmitter.statusCode = 403;
      process.nextTick(() => {
        callback?.(responseEmitter);
        responseEmitter.emit("end");
      });
    };

    requestEmitter.destroy = (error?: Error) => {
      if (error) {
        process.nextTick(() => requestEmitter.emit("error", error));
      }
    };

    return requestEmitter as unknown as ReturnType<typeof http.request>;
  }) as typeof http.request;

  try {
    const result = await extractHtmlFromUrlWithDiagnostics("http://example.com/article", ["203.0.113.7", "198.51.100.9"]);
    assert.equal(requestCalls, 2);
    assert.equal(fallbackCalls, 1);
    assert.equal(result.diagnostics.finalFetchStrategy, "hostname_fallback");
    assert.equal(result.diagnostics.fallbackAttempted, true);
    assert.equal(result.diagnostics.fallbackStatus, 200);
    assert.deepEqual(result.diagnostics.pinnedStatuses, [403, 403]);
    assert.ok(result.text.length > 100);
  } finally {
    http.request = originalRequest;
    globalThis.fetch = originalFetch;
  }
});

test("extractHtmlFromUrl falls back to hostname fetch when pinned HTML is unreadable", async () => {
  const html = await readFile(new URL("../../../fixtures/html/article.html", import.meta.url), "utf-8");
  const unreadableHtml = "<html><body><p>Too short.</p></body></html>";
  const originalRequest = http.request;
  const originalFetch = globalThis.fetch;
  let requestCalls = 0;
  let fallbackCalls = 0;

  globalThis.fetch = (async () => {
    fallbackCalls += 1;
    return makeMockResponse(200, html);
  }) as typeof fetch;

  http.request = ((...args: unknown[]) => {
    requestCalls += 1;
    const callback =
      typeof args[1] === "function"
        ? (args[1] as (response: EventEmitter & { statusCode?: number }) => void)
        : typeof args[2] === "function"
          ? (args[2] as (response: EventEmitter & { statusCode?: number }) => void)
          : null;

    const requestEmitter = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };

    requestEmitter.end = () => {
      const responseEmitter = new EventEmitter() as EventEmitter & { statusCode?: number };
      responseEmitter.statusCode = 200;
      process.nextTick(() => {
        callback?.(responseEmitter);
        responseEmitter.emit("data", Buffer.from(unreadableHtml, "utf8"));
        responseEmitter.emit("end");
      });
    };

    requestEmitter.destroy = (error?: Error) => {
      if (error) {
        process.nextTick(() => requestEmitter.emit("error", error));
      }
    };

    return requestEmitter as unknown as ReturnType<typeof http.request>;
  }) as typeof http.request;

  try {
    const result = await extractHtmlFromUrlWithDiagnostics("http://example.com/article", ["203.0.113.7"]);
    assert.equal(requestCalls, 1);
    assert.equal(fallbackCalls, 1);
    assert.equal(result.diagnostics.finalFetchStrategy, "hostname_fallback");
    assert.equal(result.diagnostics.fallbackStatus, 200);
    assert.deepEqual(result.diagnostics.pinnedStatuses, [200]);
    assert.ok(result.text.length > 100);
  } finally {
    http.request = originalRequest;
    globalThis.fetch = originalFetch;
  }
});

test("extractHtmlFromUrl preserves blocked-site errors when pinned and hostname fetches both fail", async () => {
  const originalRequest = http.request;
  const originalFetch = globalThis.fetch;
  let fallbackCalls = 0;

  globalThis.fetch = (async () => {
    fallbackCalls += 1;
    return makeMockResponse(403, "");
  }) as typeof fetch;

  http.request = ((...args: unknown[]) => {
    const callback =
      typeof args[1] === "function"
        ? (args[1] as (response: EventEmitter & { statusCode?: number }) => void)
        : typeof args[2] === "function"
          ? (args[2] as (response: EventEmitter & { statusCode?: number }) => void)
          : null;

    const requestEmitter = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };

    requestEmitter.end = () => {
      const responseEmitter = new EventEmitter() as EventEmitter & { statusCode?: number };
      responseEmitter.statusCode = 403;
      process.nextTick(() => {
        callback?.(responseEmitter);
        responseEmitter.emit("end");
      });
    };

    requestEmitter.destroy = (error?: Error) => {
      if (error) {
        process.nextTick(() => requestEmitter.emit("error", error));
      }
    };

    return requestEmitter as unknown as ReturnType<typeof http.request>;
  }) as typeof http.request;

  try {
    let caught: unknown = null;
    await assert.rejects(() => extractHtmlFromUrl("http://example.com/article", ["203.0.113.7"]), (error: unknown) => {
      caught = error;
      return (
        error instanceof AppError &&
        error.code === errorCodes.EXTRACTION_FAILED &&
        error.userMessage.toLowerCase().includes("blocked access")
      );
    });
    assert.equal(fallbackCalls, 1);
    assert.equal(shouldSuggestHtmlSnapshotForError(caught), true);
  } finally {
    http.request = originalRequest;
    globalThis.fetch = originalFetch;
  }
});

test("extractHtmlFromUrl does not suggest html snapshot when fallback failed for another reason", async () => {
  const originalRequest = http.request;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    const err = new Error("fetch failed");
    (err as Error & { cause?: { code?: string } }).cause = { code: "UND_ERR_HEADERS_TIMEOUT" };
    throw err;
  }) as typeof fetch;

  http.request = ((...args: unknown[]) => {
    const callback =
      typeof args[1] === "function"
        ? (args[1] as (response: EventEmitter & { statusCode?: number }) => void)
        : typeof args[2] === "function"
          ? (args[2] as (response: EventEmitter & { statusCode?: number }) => void)
          : null;

    const requestEmitter = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };

    requestEmitter.end = () => {
      const responseEmitter = new EventEmitter() as EventEmitter & { statusCode?: number };
      responseEmitter.statusCode = 403;
      process.nextTick(() => {
        callback?.(responseEmitter);
        responseEmitter.emit("end");
      });
    };

    requestEmitter.destroy = (error?: Error) => {
      if (error) {
        process.nextTick(() => requestEmitter.emit("error", error));
      }
    };

    return requestEmitter as unknown as ReturnType<typeof http.request>;
  }) as typeof http.request;

  try {
    let caught: unknown = null;
    await assert.rejects(() => extractHtmlFromUrl("http://example.com/article", ["203.0.113.7"]), (error: unknown) => {
      caught = error;
      return error instanceof AppError && error.code === errorCodes.EXTRACTION_FAILED;
    });
    assert.equal(shouldSuggestHtmlSnapshotForError(caught), false);
  } finally {
    http.request = originalRequest;
    globalThis.fetch = originalFetch;
  }
});

test("extractHtmlFromUrl handles pinned lookup callbacks in all-address mode", async () => {
  const html = await readFile(new URL("../../../fixtures/html/article.html", import.meta.url), "utf-8");
  const originalRequest = http.request;
  let allAddressLookupHandled = false;

  http.request = ((...args: unknown[]) => {
    const callback =
      typeof args[1] === "function"
        ? (args[1] as (response: EventEmitter & { statusCode?: number }) => void)
        : typeof args[2] === "function"
          ? (args[2] as (response: EventEmitter & { statusCode?: number }) => void)
          : null;

    const requestOptions = args[0] as {
      agent?: {
        options?: {
          lookup?: (
            hostname: string,
            options: { all?: boolean },
            callback: (err: Error | null, addresses: Array<{ address: string; family: number }>) => void
          ) => void;
        };
      };
    };

    const requestEmitter = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };

    requestEmitter.end = () => {
      const lookup = requestOptions.agent?.options?.lookup;
      if (typeof lookup !== "function") {
        process.nextTick(() =>
          requestEmitter.emit("error", Object.assign(new Error("missing lookup"), { code: "ERR_LOOKUP_MISSING" }))
        );
        return;
      }

      lookup("example.com", { all: true }, (error, addresses) => {
        if (error) {
          process.nextTick(() => requestEmitter.emit("error", error));
          return;
        }
        allAddressLookupHandled =
          Array.isArray(addresses) &&
          addresses.length === 1 &&
          addresses[0]?.address === "203.0.113.7" &&
          addresses[0]?.family === 4;

        const responseEmitter = new EventEmitter() as EventEmitter & { statusCode?: number };
        responseEmitter.statusCode = 200;
        process.nextTick(() => {
          callback?.(responseEmitter);
          responseEmitter.emit("data", Buffer.from(html, "utf8"));
          responseEmitter.emit("end");
        });
      });
    };

    requestEmitter.destroy = (error?: Error) => {
      if (error) {
        process.nextTick(() => requestEmitter.emit("error", error));
      }
    };

    return requestEmitter as unknown as ReturnType<typeof http.request>;
  }) as typeof http.request;

  try {
    const result = await extractHtmlFromUrl("http://example.com/article", ["203.0.113.7"]);
    assert.equal(allAddressLookupHandled, true);
    assert.ok(result.text.length > 100);
    assert.ok(result.markdown.length > 80);
    assert.ok(result.title.length > 0);
  } finally {
    http.request = originalRequest;
  }
});

test("extractHtmlSnapshot extracts content without network fetch", async () => {
  const html = await readFile(new URL("../../../fixtures/html/article.html", import.meta.url), "utf-8");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = (async (..._args: unknown[]) => {
    fetchCalls += 1;
    throw new Error("unexpected network fetch");
  }) as typeof fetch;

  const result = extractHtmlSnapshot({
    html,
    url: "https://example.com/private-article"
  });

  assert.ok(result.text.length > 100);
  assert.ok(result.markdown.length > 80);
  assert.ok(result.title.length > 0);
  assert.equal(fetchCalls, 0);

  globalThis.fetch = originalFetch;
});

test("extractHtmlSnapshot fails with actionable message for low-signal content", () => {
  const html = "<html><body><p>Too short.</p></body></html>";

  assert.throws(
    () =>
      extractHtmlSnapshot({
        html,
        url: "https://example.com/too-short"
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === errorCodes.EXTRACTION_EMPTY &&
      error.userMessage.toLowerCase().includes("didn't contain enough article text")
  );
});

test("extractHtmlSnapshot rejects explicit Cloudflare block pages", () => {
  const html = `
    <!doctype html>
    <html>
      <head><title>Attention Required! | Cloudflare</title></head>
      <body>
        <div id="cf-wrapper">
          <h1>Sorry, you have been blocked</h1>
          <p>You are unable to access geekwire.com.</p>
          <p>Why have I been blocked? This website is using a security service to protect itself from online attacks.</p>
          <p>Cloudflare Ray ID: 1234567890</p>
        </div>
      </body>
    </html>
  `;

  assert.throws(
    () =>
      extractHtmlSnapshot({
        html,
        url: "https://www.geekwire.com/blocked"
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === errorCodes.EXTRACTION_FAILED &&
      error.userMessage === BLOCKED_PAGE_HTML_SNAPSHOT_MESSAGE
  );
});

test("extractHtmlSnapshot rejects lightweight Cloudflare verification pages", () => {
  const html = `
    <!doctype html>
    <html>
      <head><title>Verifying...</title></head>
      <body>
        <main id="cf-wrapper">
          <h1>Verifying...</h1>
          <p>Please wait while we verify your browser.</p>
          <p>Performance & security by Cloudflare</p>
        </main>
        <script src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/orchestrate/jsch/v1"></script>
      </body>
    </html>
  `;

  assert.throws(
    () =>
      extractHtmlSnapshot({
        html,
        url: "https://openai.com/index/introducing-gpt-5"
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === errorCodes.EXTRACTION_FAILED &&
      error.userMessage === BLOCKED_PAGE_HTML_SNAPSHOT_MESSAGE
  );
});

test("extractHtmlSnapshot still extracts readable articles with hidden challenge plumbing", () => {
  const html = `
    <!doctype html>
    <html>
      <head><title>GeekWire-style article</title></head>
      <body>
        <article>
          <h1>GeekWire-style article</h1>
          <p>This visible article body is already readable and should not be rejected just because the site injects a hidden background challenge frame.</p>
          <p>The server should still extract the article because the real content is present in the snapshot.</p>
        </article>
        <iframe
          src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/orchestrate/jsch/v1"
          title="background challenge"
          style="position:absolute;top:0;left:0;border:none;visibility:hidden"
        ></iframe>
      </body>
    </html>
  `;

  const result = extractHtmlSnapshot({
    html,
    url: "https://www.geekwire.com/example-article/"
  });

  assert.match(result.text, /already readable/i);
  assert.match(result.text, /real content is present in the snapshot/i);
});

test("extractTextFromPdf extracts text fixture", async () => {
  const data = await readFile(new URL("../../../fixtures/pdf/text-based.pdf", import.meta.url));
  const result = await extractTextFromPdf(new Uint8Array(data));
  assert.ok(result.pages >= 1);
  assert.ok(result.text.toLowerCase().includes("fixture"));
  assert.ok(result.markdown.length > 40);
  assert.ok(result.title === null || typeof result.title === "string");
});

test("extractTextFromPdf fails scanned-style fixture", async () => {
  const data = await readFile(new URL("../../../fixtures/pdf/scanned-like.pdf", import.meta.url));
  await assert.rejects(() => extractTextFromPdf(new Uint8Array(data)));
});

test("cleanPdfTextWithAbogenRules strips bracket/page-number artifacts", () => {
  const raw = `
    Example paragraph with references [12] that should disappear.
    24
    Footer text 49
    - 51 -
  `;

  const cleaned = cleanPdfTextWithAbogenRules(raw);
  assert.ok(cleaned.includes("Example paragraph with references"));
  assert.ok(!cleaned.includes("[12]"));
  assert.ok(!cleaned.includes("- 51 -"));
  assert.ok(!cleaned.includes("Footer text 49"));
});
