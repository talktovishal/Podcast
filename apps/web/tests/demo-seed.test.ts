import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { resolveDemoAudioStrategy } from "../src/lib/demo-seed";

test("resolveDemoAudioStrategy prefers fast audio for parity and CI runs", () => {
  assert.equal(resolveDemoAudioStrategy({ runtimeProfile: "parity", platform: "linux" }), "fast");
  assert.equal(resolveDemoAudioStrategy({ ci: "true", platform: "linux" }), "fast");
});

test("resolveDemoAudioStrategy keeps native and provider defaults outside parity", () => {
  assert.equal(resolveDemoAudioStrategy({ platform: "darwin", runtimeProfile: "simple" }), "native");
  assert.equal(resolveDemoAudioStrategy({ platform: "linux", runtimeProfile: "simple" }), "provider");
});

test("parity compose gives the web healthcheck a startup grace period", () => {
  const composePath = resolve(process.cwd(), "../..", "docker-compose.parity.yml");
  const source = readFileSync(composePath, "utf8");

  assert.match(
    source,
    /web:\n(?: {2}.+\n)+ {4}healthcheck:\n(?: {6}.+\n)* {6}start_period: 120s/m
  );
});
