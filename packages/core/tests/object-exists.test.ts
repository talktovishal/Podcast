import assert from "node:assert/strict";
import test from "node:test";
import { headObjectIfExists, isObjectNotFound } from "../src/storage/objectExists";

test("only authoritative local or Azure blob absence is classified as missing", () => {
  assert.equal(isObjectNotFound({ code: "ENOENT" }), true);
  assert.equal(isObjectNotFound({ statusCode: 404, code: "BlobNotFound" }), true);
  for (const error of [
    { statusCode: 404 }, { statusCode: 404, code: "ContainerNotFound" },
    { statusCode: 403 }, { statusCode: 429 }, { statusCode: 500 },
    { code: "EACCES" }, { code: "ETIMEDOUT" }, new Error("Not found"), null
  ]) {
    assert.equal(isObjectNotFound(error), false);
  }
});

test("HEAD preserves metadata, returns null for absence and propagates outages", async () => {
  const head = { key: "audio.mp3", bytes: 42, contentType: "audio/mpeg" };
  assert.equal(await headObjectIfExists({ headObject: async () => head }, head.key), head);
  assert.equal(await headObjectIfExists({ headObject: async () => { throw { code: "ENOENT" }; } }, head.key), null);
  const error = Object.assign(new Error("storage outage"), { statusCode: 503 });
  await assert.rejects(headObjectIfExists({ headObject: async () => { throw error; } }, head.key), (caught) => caught === error);
});
