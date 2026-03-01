type EpisodeTokenSnapshot = {
  id: string;
  audioPath: string;
  mediaToken: string;
};

type ItemWithEpisodeToken = {
  id: string;
  episode: EpisodeTokenSnapshot | null;
};

/**
 * Keep existing media tokens for unchanged episodes so dashboard polling does not
 * churn <audio src> values and interrupt playback.
 */
export function mergeItemsPreservingEpisodeTokens<T extends ItemWithEpisodeToken>(
  previous: readonly T[],
  incoming: readonly T[]
): T[] {
  const previousById = new Map(previous.map((item) => [item.id, item] as const));
  return incoming.map((item) => {
    if (!item.episode) {
      return item;
    }

    const previousItem = previousById.get(item.id);
    const previousEpisode = previousItem?.episode;
    if (!previousEpisode) {
      return item;
    }

    if (previousEpisode.id !== item.episode.id || previousEpisode.audioPath !== item.episode.audioPath) {
      return item;
    }

    return {
      ...item,
      episode: {
        ...item.episode,
        mediaToken: previousEpisode.mediaToken
      }
    };
  });
}
