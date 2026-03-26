import assert from "node:assert/strict";
import test from "node:test";
import { parseCliOptions } from "../src/options.js";

test("parseCliOptions accepts compare defaults", () => {
  const options = parseCliOptions([]);
  assert.equal(options.command, "compare");
  assert.equal(options.mode, "dual");
  assert.equal(options.concurrencyUrl, 8);
  assert.equal(options.concurrencyExtension, 3);
});

test("parseCliOptions parses explicit flags", () => {
  const options = parseCliOptions([
    "compare",
    "--mode",
    "extension",
    "--input",
    "/tmp/urls.txt",
    "--site",
    "alpha,beta",
    "--limit",
    "10",
    "--concurrency-url",
    "4",
    "--concurrency-extension",
    "2",
    "--headed"
  ]);

  assert.equal(options.command, "compare");
  assert.equal(options.mode, "extension");
  assert.equal(options.inputPath, "/tmp/urls.txt");
  assert.deepEqual(options.siteIds, ["alpha", "beta"]);
  assert.equal(options.limit, 10);
  assert.equal(options.concurrencyUrl, 4);
  assert.equal(options.concurrencyExtension, 2);
  assert.equal(options.headed, true);
});
