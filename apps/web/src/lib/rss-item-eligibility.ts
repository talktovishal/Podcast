type FeedItemState = { userId: string; status: string };

export async function filterReadyItemEpisodes<T extends { itemId: string }>(
  episodes: readonly T[],
  userId: string,
  findItem: (id: string) => Promise<FeedItemState | null>
): Promise<T[]> {
  const ready = new Set<string>();
  for (const id of new Set(episodes.map((episode) => episode.itemId))) {
    const item = await findItem(id);
    if (item?.userId === userId && item.status === "READY") {
      ready.add(id);
    }
  }
  return episodes.filter((episode) => ready.has(episode.itemId));
}
