import assert from "node:assert/strict";
import test from "node:test";
import {
  detectCaptureTarget,
  inferPdfFileName,
  LOCAL_FILE_PDF_UPLOAD_MESSAGE,
  uploadRemotePdfCapture,
} from "../../extension/pdf-capture.mjs";

test("detectCaptureTarget flags local file URLs before attempting page inspection", async () => {
  let executeCalls = 0;
  const chromeApi = {
    scripting: {
      executeScript: async () => {
        executeCalls += 1;
        return [];
      },
    },
  };

  const result = await detectCaptureTarget(chromeApi, {
    id: 42,
    url: "file:///Users/me/Desktop/report.pdf",
  });

  assert.equal(result.mode, "local-file");
  assert.equal(result.contentType, "");
  assert.equal(executeCalls, 0);
  assert.match(LOCAL_FILE_PDF_UPLOAD_MESSAGE, /articlepod\.com\/app/i);
});

test("detectCaptureTarget marks remote PDFs from document.contentType", async () => {
  const chromeApi = {
    scripting: {
      executeScript: async () => [{ result: "application/pdf" }],
    },
  };

  const result = await detectCaptureTarget(chromeApi, {
    id: 7,
    url: "https://example.com/report.pdf",
  });

  assert.equal(result.mode, "remote-pdf");
  assert.equal(result.contentType, "application/pdf");
});

test("detectCaptureTarget leaves normal webpages on the HTML snapshot path", async () => {
  const chromeApi = {
    scripting: {
      executeScript: async () => [{ result: "text/html" }],
    },
  };

  const result = await detectCaptureTarget(chromeApi, {
    id: 9,
    url: "https://example.com/article",
  });

  assert.equal(result.mode, "html-page");
  assert.equal(result.contentType, "text/html");
});

test("detectCaptureTarget falls back to PDF URL detection when contentType is unavailable", async () => {
  const chromeApi = {
    scripting: {
      executeScript: async () => {
        throw new Error("viewer contentType unavailable");
      },
    },
  };

  const result = await detectCaptureTarget(chromeApi, {
    id: 11,
    url: "https://example.com/files/annual-letter.pdf",
  });

  assert.equal(result.mode, "remote-pdf");
  assert.equal(result.contentType, "");
});

test("uploadRemotePdfCapture fetches tab bytes and submits multipart PDF upload", async () => {
  const seen: Array<{ url: string; method: string }> = [];
  const pdfBytes = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55]);

  const response = await uploadRemotePdfCapture({
    fetchImpl: async (url: RequestInfo | URL, init: RequestInit = {}) => {
      seen.push({
        url: String(url),
        method: init.method || "GET",
      });

      if (seen.length === 1) {
        assert.equal(String(url), "https://example.com/research/report");
        assert.equal(init.credentials, "include");
        return new Response(pdfBytes, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="market-brief.pdf"',
          },
        });
      }

      assert.equal(String(url), "https://articlepod.com/api/items/pdf");
      assert.equal(init.method, "POST");
      const headers = init.headers as Record<string, string>;
      assert.equal(headers.authorization, "Bearer extension-token");
      const body = init.body;
      assert.ok(body instanceof FormData);

      const file = body.get("file");
      assert.ok(file instanceof File);
      assert.equal(file.name, "market-brief.pdf");
      assert.equal(file.type, "application/pdf");
      assert.deepEqual(
        Array.from(new Uint8Array(await file.arrayBuffer())),
        Array.from(pdfBytes),
      );
      assert.equal(body.get("importance"), "HIGH");
      assert.equal(body.get("tags"), "finance, markets");

      return new Response(JSON.stringify({ ok: true, item_id: "item-123" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    },
    tabUrl: "https://example.com/research/report",
    serverUrl: "https://articlepod.com",
    extensionToken: "extension-token",
    importance: "HIGH",
    tags: "finance, markets",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    seen.map((entry) => `${entry.method} ${entry.url}`),
    [
      "GET https://example.com/research/report",
      "POST https://articlepod.com/api/items/pdf",
    ],
  );
});

test("inferPdfFileName falls back to a stable PDF suffix when the URL has no file name", () => {
  assert.equal(
    inferPdfFileName("https://example.com/research/?id=123"),
    "browser-capture.pdf",
  );
});
