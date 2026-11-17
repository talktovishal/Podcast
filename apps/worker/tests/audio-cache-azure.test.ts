import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { AzureBlobObjectStorage } from "@articlepod/core/src/storage/azureBlobStorage";
import { copyCachedAudio } from "../src/lib/audio-cache";

test("Azure SDK cache copies preserve independent objects, MIME type and ranges", async () => {
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const server = createServer(async (request, response) => {
    const key = new URL(request.url ?? "/", "http://localhost").pathname;
    response.setHeader("x-ms-request-id", "synthetic-ownership-test");
    response.setHeader("etag", '"fixture"');
    if (request.method === "PUT") {
      const parts: Buffer[] = [];
      for await (const part of request) parts.push(Buffer.from(part));
      objects.set(key, { bytes: Buffer.concat(parts), contentType: String(request.headers["x-ms-blob-content-type"] ?? "audio/mpeg") });
      response.writeHead(201, { "content-length": "0" }).end();
      return;
    }
    const object = objects.get(key);
    if (!object) {
      const xml = "<Error><Code>BlobNotFound</Code><Message>Fixture blob absent</Message></Error>";
      response.writeHead(404, { "x-ms-error-code": "BlobNotFound", "content-type": "application/xml", "content-length": Buffer.byteLength(xml) });
      response.end(request.method === "HEAD" ? undefined : xml);
      return;
    }
    if (request.method === "DELETE") {
      objects.delete(key);
      response.writeHead(202, { "content-length": "0" }).end();
      return;
    }
    const range = String(request.headers["x-ms-range"] ?? request.headers.range ?? "").match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Number(range[2]) : object.bytes.length - 1;
    const bytes = object.bytes.subarray(start, end + 1);
    response.setHeader("content-type", object.contentType);
    response.setHeader("content-length", bytes.length);
    response.setHeader("accept-ranges", "bytes");
    if (range) response.setHeader("content-range", `bytes ${start}-${end}/${object.bytes.length}`);
    response.statusCode = range ? 206 : 200;
    response.end(request.method === "HEAD" ? undefined : bytes);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const storage = new AzureBlobObjectStorage({
    container: "audio", createContainerIfMissing: false,
    connectionString: `DefaultEndpointsProtocol=http;AccountName=test;AccountKey=ZmFrZQ==;BlobEndpoint=http://127.0.0.1:${address.port}/test;`
  });
  try {
    const source = "items/owner/episode.mp3";
    const bytes = Buffer.from("0123456789");
    await storage.putObject(source, bytes, { contentType: "audio/mpeg" });
    const copied = await copyCachedAudio({ filePath: source, audioBytes: bytes.length, mimeType: "audio/mpeg" },
      "copy", "c".repeat(64), storage);
    assert.ok(copied);
    assert.notEqual(copied.filePath, source);
    await storage.deleteObject(source);
    assert.deepEqual(await storage.getObject(copied.filePath), bytes);
    assert.equal((await storage.headObject(copied.filePath)).contentType, "audio/mpeg");
    assert.deepEqual(await storage.getObject(copied.filePath, { start: 0, end: 1 }), Buffer.from("01"));
    assert.equal(await copyCachedAudio({ filePath: source, audioBytes: bytes.length, mimeType: "audio/mpeg" },
      "another", "d".repeat(64), storage), null);
  } finally {
    server.close();
    server.closeAllConnections();
    await once(server, "close");
  }
});
