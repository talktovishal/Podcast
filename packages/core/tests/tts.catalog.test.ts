import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultVoiceForProvider,
  getTtsCatalog,
  isValidVoiceForProvider,
  normalizeTtsSelection
} from "../src/tts/catalog";

test("normalizeTtsSelection applies defaults when selection is missing", () => {
  const selection = normalizeTtsSelection({});
  assert.equal(selection.providerId, "kokoro");
  assert.equal(selection.voice, "af_heart");
});

test("normalizeTtsSelection keeps valid provider and voice", () => {
  const selection = normalizeTtsSelection({
    providerId: "kokoro",
    voice: "af_heart"
  });
  assert.equal(selection.providerId, "kokoro");
  assert.equal(selection.voice, "af_heart");
});

test("normalizeTtsSelection falls back when voice is invalid", () => {
  const selection = normalizeTtsSelection({
    providerId: "melo",
    voice: "not-real"
  });
  assert.equal(selection.providerId, "kokoro");
  assert.equal(selection.voice, getDefaultVoiceForProvider("kokoro"));
});

test("catalog includes voices for each provider", () => {
  const catalog = getTtsCatalog();
  for (const provider of catalog.providers) {
    const voices = catalog.voicesByProvider[provider.id];
    assert.ok(Array.isArray(voices));
    assert.ok(voices.length > 0);
    assert.ok(isValidVoiceForProvider(provider.id, voices[0].id));
  }
});
