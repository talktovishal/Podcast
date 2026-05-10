import { JSDOM } from "jsdom";
import { BRAND_BOT_USER_AGENT } from "../config/brand";
import { AppError, errorCodes } from "../errors/codes";
import { cleanExtractedMarkdown, hasNarratableText, markdownToNarrationText } from "../extract/markdownCleanup";
import { extractHtmlSnapshot } from "../extract/html";
import { validateFetchableUrl } from "../security/urlPolicy";

const APPLE_LOOKUP_URL = "https://itunes.apple.com/lookup";
const MAX_LOOKUP_EPISODES = 200;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_RSS_BYTES = 5 * 1024 * 1024;
const MAX_TRANSCRIPT_BYTES = 1 * 1024 * 1024;

const APPLE_SHOW_MESSAGE = "Open a specific Apple Podcasts episode, then submit or capture that page.";
export const PODCAST_TRANSCRIPT_NOT_FOUND_MESSAGE =
  "Could not find a public transcript for this podcast episode.";

type FetchLike = typeof fetch;

export type TranscriptCandidate =
  | { kind: "apple_podcast_episode"; url: string; showId: string; episodeId: string }
  | { kind: "apple_podcast_show"; url: string; showId: string }
  | { kind: "direct_transcript"; url: string }
  | { kind: "none" };

export type TranscriptFormat = "vtt" | "srt" | "text" | "html";

type AppleLookupResult = {
  wrapperType?: string;
  kind?: string;
  collectionId?: number;
  trackId?: number;
  collectionName?: string;
  trackName?: string;
  feedUrl?: string;
  episodeGuid?: string;
  releaseDate?: string;
};

export type ResolvedPodcastTranscript = {
  title: string;
  markdown: string;
  sourceUrl: string;
  transcriptUrl: string;
  transcriptFormat: TranscriptFormat;
  podcastTitle?: string | null;
  episodeGuid?: string | null;
};

type ResolveOptions = {
  fetchImpl?: FetchLike;
  validateUrl?: typeof validateFetchableUrl;
};

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function isApplePodcastsHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "podcasts.apple.com";
}

function parseApplePodcastIds(url: URL): { showId: string | null; episodeId: string | null } {
  const showId = url.pathname.match(/\/id(\d+)(?:[/?#]|$)/)?.[1] ?? null;
  return {
    showId,
    episodeId: url.searchParams.get("i")
  };
}

function extensionForPath(pathname: string): string {
  const match = pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

function inferTranscriptFormatFromUrl(url: URL): TranscriptFormat | null {
  const ext = extensionForPath(url.pathname);
  if (ext === "vtt") {
    return "vtt";
  }
  if (ext === "srt") {
    return "srt";
  }
  if (ext === "txt" || ext === "text") {
    return "text";
  }
  if ((ext === "html" || ext === "htm") && /transcript|caption|subtitle/i.test(url.pathname)) {
    return "html";
  }
  return null;
}

function inferTranscriptFormat(input: { url: string; contentType?: string | null; declaredType?: string | null }): TranscriptFormat | null {
  const contentType = (input.contentType || input.declaredType || "").toLowerCase().split(";")[0].trim();
  if (contentType === "text/vtt") {
    return "vtt";
  }
  if (contentType === "application/x-subrip" || contentType === "application/srt" || contentType === "text/srt") {
    return "srt";
  }
  if (contentType === "text/plain") {
    return "text";
  }
  if (contentType === "text/html" || contentType === "application/xhtml+xml") {
    return "html";
  }

  const parsed = parseUrl(input.url);
  return parsed ? inferTranscriptFormatFromUrl(parsed) : null;
}

export function classifyTranscriptCandidate(input: { url: string; html?: string | null }): TranscriptCandidate {
  const url = parseUrl(input.url);
  if (!url) {
    return { kind: "none" };
  }

  if (isApplePodcastsHost(url.hostname)) {
    const ids = parseApplePodcastIds(url);
    if (ids.showId && ids.episodeId) {
      return { kind: "apple_podcast_episode", url: url.toString(), showId: ids.showId, episodeId: ids.episodeId };
    }
    if (ids.showId) {
      return { kind: "apple_podcast_show", url: url.toString(), showId: ids.showId };
    }
  }

  if (inferTranscriptFormatFromUrl(url)) {
    return { kind: "direct_transcript", url: url.toString() };
  }

  if (/transcript|caption|subtitle/i.test(url.pathname) && ["http:", "https:"].includes(url.protocol)) {
    return { kind: "direct_transcript", url: url.toString() };
  }

  return { kind: "none" };
}

async function fetchJson(url: URL, fetchImpl: FetchLike): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { "user-agent": BRAND_BOT_USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new AppError(errorCodes.EXTRACTION_FAILED, "Could not resolve this Apple Podcasts episode.", 502);
  }
  return response.json();
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

async function fetchValidatedText(
  rawUrl: string,
  input: { maxBytes: number; fetchImpl: FetchLike; validateUrl: typeof validateFetchableUrl }
): Promise<{ url: string; text: string; contentType: string | null }> {
  let current = rawUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const validated = await input.validateUrl(current);
    const response = await input.fetchImpl(validated.url.toString(), {
      redirect: "manual",
      headers: { "user-agent": BRAND_BOT_USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new AppError(errorCodes.EXTRACTION_FAILED, "The transcript URL redirected without a destination.", 502);
      }
      current = new URL(location, validated.url).toString();
      continue;
    }

    if (!response.ok) {
      throw new AppError(errorCodes.EXTRACTION_FAILED, "Could not fetch the public transcript.", 502);
    }

    const contentLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > input.maxBytes) {
      throw new AppError(
        errorCodes.PODCAST_TRANSCRIPT_TOO_LARGE,
        "This podcast transcript is too large to import right now.",
        413
      );
    }

    const text = await response.text();
    if (byteLength(text) > input.maxBytes) {
      throw new AppError(
        errorCodes.PODCAST_TRANSCRIPT_TOO_LARGE,
        "This podcast transcript is too large to import right now.",
        413
      );
    }
    return {
      url: validated.url.toString(),
      text,
      contentType: response.headers.get("content-type")
    };
  }

  throw new AppError(errorCodes.EXTRACTION_FAILED, "The transcript URL redirected too many times.", 502);
}

function normalizeCueText(line: string): string {
  return line
    .replace(/<\d{2}:\d{2}:\d{2}[.,]\d{3}>/g, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCueTranscript(raw: string): string {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const paragraphs: string[] = [];
  let current: string[] = [];
  let skipBlock = false;
  let lastText = "";

  function flush() {
    const text = current.join(" ").replace(/\s+/g, " ").trim();
    current = [];
    if (!text || text === lastText) {
      return;
    }
    lastText = text;
    paragraphs.push(text);
  }

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line) {
      flush();
      skipBlock = false;
      continue;
    }
    if (/^(WEBVTT|STYLE|REGION)$/i.test(line) || /^NOTE(?:\s|$)/i.test(line)) {
      flush();
      skipBlock = true;
      continue;
    }
    if (skipBlock) {
      continue;
    }
    if (/^\d+$/.test(line) || /-->/u.test(line)) {
      flush();
      continue;
    }
    const normalized = normalizeCueText(line);
    if (normalized) {
      current.push(normalized);
    }
  }
  flush();

  return paragraphs.join("\n\n");
}

function normalizePlainTranscript(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeCueText(line))
    .filter(Boolean)
    .join("\n\n");
}

function normalizeHtmlTranscript(raw: string, url: string): string {
  try {
    return extractHtmlSnapshot({ html: raw, url }).markdown;
  } catch {
    const dom = new JSDOM(raw, { url });
    const paragraphs = Array.from(dom.window.document.body?.querySelectorAll("p, li, div") ?? [])
      .map((node) => normalizeCueText(node.textContent || ""))
      .filter((line, index, all) => line && all.indexOf(line) === index);
    return paragraphs.length > 0 ? paragraphs.join("\n\n") : normalizeCueText(dom.window.document.body?.textContent || "");
  }
}

export function normalizePodcastTranscript(input: { raw: string; format: TranscriptFormat; url: string; title?: string | null }): string {
  const body =
    input.format === "vtt" || input.format === "srt"
      ? normalizeCueTranscript(input.raw)
      : input.format === "html"
        ? normalizeHtmlTranscript(input.raw, input.url)
        : normalizePlainTranscript(input.raw);
  const titled = input.title?.trim() ? `# ${input.title.trim()}\n\n${body}` : body;
  const cleaned = cleanExtractedMarkdown(titled);
  const narrationText = markdownToNarrationText(cleaned);
  if (!hasNarratableText(narrationText)) {
    throw new AppError(errorCodes.EXTRACTION_EMPTY, "This podcast transcript did not contain enough usable text.", 422);
  }
  return cleaned;
}

function directChildText(element: Element, localName: string): string | null {
  for (const child of Array.from(element.children)) {
    if (child.localName.toLowerCase() === localName.toLowerCase()) {
      return child.textContent?.trim() || null;
    }
  }
  return null;
}

function parseXml(xml: string, url: string): Document {
  const dom = new JSDOM(xml, { url, contentType: "text/xml" });
  const document = dom.window.document;
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new AppError(errorCodes.EXTRACTION_FAILED, "The podcast feed is not valid XML.", 502);
  }
  return document;
}

function findEpisodeItem(document: Document, episode: AppleLookupResult): Element | null {
  const items = Array.from(document.getElementsByTagName("item"));
  const guid = episode.episodeGuid?.trim();
  if (guid) {
    const byGuid = items.find((item) => directChildText(item, "guid") === guid);
    if (byGuid) {
      return byGuid;
    }
  }

  const title = episode.trackName?.trim().toLowerCase();
  const releaseDate = episode.releaseDate ? new Date(episode.releaseDate) : null;
  return (
    items.find((item) => {
      const itemTitle = directChildText(item, "title")?.toLowerCase();
      if (!title || itemTitle !== title) {
        return false;
      }
      if (!releaseDate || Number.isNaN(releaseDate.getTime())) {
        return true;
      }
      const itemDate = directChildText(item, "pubDate");
      if (!itemDate) {
        return true;
      }
      const parsedItemDate = new Date(itemDate);
      if (Number.isNaN(parsedItemDate.getTime())) {
        return true;
      }
      return Math.abs(parsedItemDate.getTime() - releaseDate.getTime()) < 36 * 60 * 60 * 1000;
    }) ?? null
  );
}

function listTranscriptTags(item: Element): Array<{ url: string; type: string | null }> {
  return Array.from(item.getElementsByTagName("*"))
    .filter((element) => element.localName.toLowerCase() === "transcript")
    .map((element) => ({
      url: element.getAttribute("url")?.trim() || "",
      type: element.getAttribute("type")?.trim() || null
    }))
    .filter((entry) => Boolean(entry.url));
}

function transcriptPreference(format: TranscriptFormat): number {
  switch (format) {
    case "vtt":
      return 0;
    case "srt":
      return 1;
    case "text":
      return 2;
    case "html":
      return 3;
  }
}

function chooseTranscriptTag(tags: Array<{ url: string; type: string | null }>, feedUrl: string): { url: string; type: string | null; format: TranscriptFormat } | null {
  const ranked = tags
    .map((tag) => {
      const absoluteUrl = new URL(tag.url, feedUrl).toString();
      const format = inferTranscriptFormat({ url: absoluteUrl, declaredType: tag.type });
      return format ? { url: absoluteUrl, type: tag.type, format } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => transcriptPreference(left.format) - transcriptPreference(right.format));
  return ranked[0] ?? null;
}

async function resolveAppleTranscript(
  candidate: Extract<TranscriptCandidate, { kind: "apple_podcast_episode" }>,
  options: Required<ResolveOptions>
): Promise<ResolvedPodcastTranscript> {
  const lookupUrl = new URL(APPLE_LOOKUP_URL);
  lookupUrl.searchParams.set("id", candidate.showId);
  lookupUrl.searchParams.set("entity", "podcastEpisode");
  lookupUrl.searchParams.set("limit", String(MAX_LOOKUP_EPISODES));
  const payload = await fetchJson(lookupUrl, options.fetchImpl);
  const results = Array.isArray((payload as { results?: unknown }).results)
    ? ((payload as { results: unknown[] }).results as AppleLookupResult[])
    : [];
  const episode = results.find((result) => result.wrapperType === "podcastEpisode" && String(result.trackId) === candidate.episodeId);
  const show = results.find((result) => result.kind === "podcast" || result.wrapperType === "track");
  const feedUrl = episode?.feedUrl || show?.feedUrl;
  if (!episode || !feedUrl) {
    throw new AppError(errorCodes.EXTRACTION_FAILED, "Could not resolve this Apple Podcasts episode.", 422);
  }

  const feed = await fetchValidatedText(feedUrl, {
    maxBytes: MAX_RSS_BYTES,
    fetchImpl: options.fetchImpl,
    validateUrl: options.validateUrl
  });
  const document = parseXml(feed.text, feed.url);
  const item = findEpisodeItem(document, episode);
  if (!item) {
    throw new AppError(errorCodes.PODCAST_TRANSCRIPT_NOT_FOUND, PODCAST_TRANSCRIPT_NOT_FOUND_MESSAGE, 422);
  }

  const tag = chooseTranscriptTag(listTranscriptTags(item), feed.url);
  if (!tag) {
    throw new AppError(errorCodes.PODCAST_TRANSCRIPT_NOT_FOUND, PODCAST_TRANSCRIPT_NOT_FOUND_MESSAGE, 422);
  }

  const transcript = await fetchValidatedText(tag.url, {
    maxBytes: MAX_TRANSCRIPT_BYTES,
    fetchImpl: options.fetchImpl,
    validateUrl: options.validateUrl
  });
  const format = inferTranscriptFormat({ url: transcript.url, contentType: transcript.contentType, declaredType: tag.type });
  if (!format) {
    throw new AppError(
      errorCodes.PODCAST_TRANSCRIPT_UNSUPPORTED,
      "This podcast transcript format is not supported yet.",
      422
    );
  }

  const title = episode.trackName?.trim() || directChildText(item, "title") || "Podcast episode transcript";
  return {
    title,
    markdown: normalizePodcastTranscript({ raw: transcript.text, format, url: transcript.url, title }),
    sourceUrl: candidate.url,
    transcriptUrl: transcript.url,
    transcriptFormat: format,
    podcastTitle: episode.collectionName || show?.collectionName || null,
    episodeGuid: episode.episodeGuid || directChildText(item, "guid")
  };
}

async function resolveDirectTranscript(
  candidate: Extract<TranscriptCandidate, { kind: "direct_transcript" }>,
  options: Required<ResolveOptions>
): Promise<ResolvedPodcastTranscript> {
  const transcript = await fetchValidatedText(candidate.url, {
    maxBytes: MAX_TRANSCRIPT_BYTES,
    fetchImpl: options.fetchImpl,
    validateUrl: options.validateUrl
  });
  const format = inferTranscriptFormat({ url: transcript.url, contentType: transcript.contentType });
  if (!format) {
    throw new AppError(
      errorCodes.PODCAST_TRANSCRIPT_UNSUPPORTED,
      "This podcast transcript format is not supported yet.",
      422
    );
  }
  const pathname = parseUrl(transcript.url)?.pathname ?? "transcript";
  const title = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "Podcast transcript").replace(/\.[^.]+$/, "");
  return {
    title,
    markdown: normalizePodcastTranscript({ raw: transcript.text, format, url: transcript.url, title }),
    sourceUrl: candidate.url,
    transcriptUrl: transcript.url,
    transcriptFormat: format,
    podcastTitle: null,
    episodeGuid: null
  };
}

export async function resolvePodcastTranscript(
  input: { url: string; html?: string | null },
  options: ResolveOptions = {}
): Promise<ResolvedPodcastTranscript> {
  const candidate = classifyTranscriptCandidate(input);
  const resolvedOptions: Required<ResolveOptions> = {
    fetchImpl: options.fetchImpl ?? fetch,
    validateUrl: options.validateUrl ?? validateFetchableUrl
  };

  if (candidate.kind === "apple_podcast_show") {
    throw new AppError(errorCodes.PODCAST_EPISODE_REQUIRED, APPLE_SHOW_MESSAGE, 422);
  }
  if (candidate.kind === "apple_podcast_episode") {
    return resolveAppleTranscript(candidate, resolvedOptions);
  }
  if (candidate.kind === "direct_transcript") {
    return resolveDirectTranscript(candidate, resolvedOptions);
  }

  throw new AppError(errorCodes.INVALID_INPUT, "This URL is not a supported podcast transcript source.", 400);
}
