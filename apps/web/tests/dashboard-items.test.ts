import assert from "node:assert/strict";
import test from "node:test";
import { mergeItemsPreservingEpisodeTokens } from "../src/lib/dashboard-items";

type TestItem = {
  id: string;
  episode: {
    id: string;
    audioPath: string;
    mediaToken: string;
  } | null;
  status: string;
};

function item(id: string, token: string, episodeId = `${id}-episode`, audioPath = `items/${id}/episode.mp3`): TestItem {
  return {
    id,
    status: "READY",
    episode: {
      id: episodeId,
      audioPath,
      mediaToken: token
    }
  };
}

test("mergeItemsPreservingEpisodeTokens keeps token for unchanged episode identity", () => {
  const previous = [item("a", "old-token")];
  const incoming = [item("a", "new-token")];

  const merged = mergeItemsPreservingEpisodeTokens(previous, incoming);
  assert.equal(merged[0]?.episode?.mediaToken, "old-token");
});

test("mergeItemsPreservingEpisodeTokens uses incoming token when episode id changes", () => {
  const previous = [item("a", "old-token", "episode-1")];
  const incoming = [item("a", "new-token", "episode-2")];

  const merged = mergeItemsPreservingEpisodeTokens(previous, incoming);
  assert.equal(merged[0]?.episode?.mediaToken, "new-token");
});

test("mergeItemsPreservingEpisodeTokens uses incoming token when audio path changes", () => {
  const previous = [item("a", "old-token", "episode-1", "items/a/episode-v1.mp3")];
  const incoming = [item("a", "new-token", "episode-1", "items/a/episode-v2.mp3")];

  const merged = mergeItemsPreservingEpisodeTokens(previous, incoming);
  assert.equal(merged[0]?.episode?.mediaToken, "new-token");
});

test("mergeItemsPreservingEpisodeTokens keeps incoming item when previous has no matching id", () => {
  const previous = [item("a", "old-token")];
  const incoming = [item("b", "new-token")];

  const merged = mergeItemsPreservingEpisodeTokens(previous, incoming);
  assert.equal(merged[0]?.episode?.mediaToken, "new-token");
});

test("mergeItemsPreservingEpisodeTokens keeps null-episode items unchanged", () => {
  const previous: TestItem[] = [item("a", "old-token")];
  const incoming: TestItem[] = [{ id: "a", episode: null, status: "PROCESSING" }];

  const merged = mergeItemsPreservingEpisodeTokens(previous, incoming);
  assert.deepEqual(merged, incoming);
});
