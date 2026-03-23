import { toRfc2822 } from "../utils/date";

export type FeedEpisode = {
  guid: string;
  title: string;
  description: string;
  pubDate: Date;
  enclosureUrl: string;
  enclosureLength: number;
  enclosureType: "audio/mpeg" | "audio/mp4";
};

export type FeedInput = {
  title: string;
  description: string;
  link: string;
  feedUrl: string;
  language: string;
  imageUrl?: string;
  episodes: FeedEpisode[];
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function validateEpisodes(episodes: FeedEpisode[]): void {
  const guidSet = new Set<string>();
  const enclosureSet = new Set<string>();

  for (const episode of episodes) {
    if (!episode.guid.trim()) {
      throw new Error("RSS episode GUID cannot be empty.");
    }

    if (guidSet.has(episode.guid)) {
      throw new Error(`Duplicate RSS GUID detected: ${episode.guid}`);
    }
    guidSet.add(episode.guid);

    if (!episode.enclosureUrl.trim()) {
      throw new Error(`Episode ${episode.guid} is missing enclosure URL.`);
    }

    if (enclosureSet.has(episode.enclosureUrl)) {
      throw new Error(`Duplicate enclosure URL detected: ${episode.enclosureUrl}`);
    }
    enclosureSet.add(episode.enclosureUrl);

    if (!Number.isFinite(episode.enclosureLength) || episode.enclosureLength < 0) {
      throw new Error(`Invalid enclosure length for episode ${episode.guid}.`);
    }
  }
}

export function buildRssXml(input: FeedInput): string {
  validateEpisodes(input.episodes);

  const sorted = [...input.episodes].sort((a, b) => {
    const dateDiff = b.pubDate.getTime() - a.pubDate.getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return a.guid.localeCompare(b.guid);
  });
  const latestPubDate = sorted[0]?.pubDate;
  const channelDateXml = latestPubDate
    ? [
        `    <pubDate>${toRfc2822(latestPubDate)}</pubDate>`,
        `    <lastBuildDate>${toRfc2822(latestPubDate)}</lastBuildDate>`
      ]
    : [];

  const items = sorted
    .map((episode) => {
      return [
        "    <item>",
        `      <title>${escapeXml(episode.title)}</title>`,
        `      <description>${escapeXml(episode.description)}</description>`,
        `      <guid isPermaLink=\"false\">${escapeXml(episode.guid)}</guid>`,
        `      <pubDate>${toRfc2822(episode.pubDate)}</pubDate>`,
        `      <enclosure url=\"${escapeXml(episode.enclosureUrl)}\" length=\"${episode.enclosureLength}\" type=\"${episode.enclosureType}\" />`,
        "    </item>"
      ].join("\n");
    })
    .join("\n");

  const imageXml = input.imageUrl
    ? [
        `    <itunes:image href=\"${escapeXml(input.imageUrl)}\" />`,
        "    <image>",
        `      <url>${escapeXml(input.imageUrl)}</url>`,
        `      <title>${escapeXml(input.title)}</title>`,
        `      <link>${escapeXml(input.link)}</link>`,
        "    </image>"
      ]
    : [];

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">',
    "  <channel>",
    `    <title>${escapeXml(input.title)}</title>`,
    `    <description>${escapeXml(input.description)}</description>`,
    `    <link>${escapeXml(input.link)}</link>`,
    `    <language>${escapeXml(input.language)}</language>`,
    ...channelDateXml,
    `    <atom:link href=\"${escapeXml(input.feedUrl)}\" rel=\"self\" type=\"application/rss+xml\" xmlns:atom=\"http://www.w3.org/2005/Atom\" />`,
    `    <itunes:author>${escapeXml(input.title)}</itunes:author>`,
    `    <itunes:summary>${escapeXml(input.description)}</itunes:summary>`,
    ...imageXml,
    items,
    "  </channel>",
    "</rss>"
  ].join("\n");
}
