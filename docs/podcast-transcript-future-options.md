# Future Podcast Transcript Coverage Options

Status: parked for later. This is not an implementation plan for the current milestone.

## Current Contract

`M122 - Internal Podcast Transcript Auto-Detection` intentionally stays narrow:

- Users still paste URLs or use Chrome extension capture; there is no visible podcast submit mode.
- Apple Podcasts episode URLs are resolved through Apple lookup, publisher RSS feeds, and public `podcast:transcript` tags.
- Direct public transcript files are accepted only when the URL or response clearly identifies VTT, SRT, TXT, or HTML.
- Successful imports become `PODCAST_TRANSCRIPT` summary-only items.
- Failed confident podcast detections stay visible in Recent items with a clear transcript-unavailable message.
- The app does not scrape Apple's in-app transcript UI, download audio enclosures, run ASR, create podcast audio/RSS artifacts, or convert a podcast transcript into another podcast episode.

## Why This Is Parked

Apple Podcasts can display transcripts that are generated or managed inside Apple's own product, but Apple does not expose a documented public server API that lets this app fetch those full Apple-generated transcripts for arbitrary podcast URLs.

Free transcript coverage is therefore partial. For now, the clean source is still publisher-provided data: RSS `podcast:transcript` tags, direct public transcript files, or public transcript pages explicitly linked by the publisher.

## Boundaries For Any Future Work

Any future extension should preserve these boundaries unless the product requirements explicitly change:

- No audio download for transcript extraction.
- No local or hosted ASR pipeline, including Whisper-style transcription.
- No scraping private, paywalled, app-only, or session-bound transcript surfaces.
- No Apple private API dependency.
- No Spotify or YouTube Music support unless separately researched and approved.
- No podcast `Job`, `Episode`, audio blob, RSS item, media URL, feed-token rotation, or request-TTS side effect.
- No paid-only provider as the default path; optional paid providers would need a separate product and cost decision.

## Free Or Free-Tier Paths Worth Reconsidering

### 1. Keep RSS And Direct Transcript Support

This is already implemented and should remain the baseline. It is the most durable, creator-aligned option because it uses the transcript source the publisher chose to expose.

Later improvements could focus on better matching, diagnostics, and support for more safe transcript MIME types if they are standard and public.

### 2. PodcastIndex As A Metadata Fallback

PodcastIndex can help find feeds and episode metadata when Apple lookup is missing, stale, or ambiguous. It should be treated as a discovery and matching helper, not a universal transcript provider.

Possible use:

- Resolve an Apple show or episode to alternate feed metadata.
- Match by GUID, enclosure URL, title, and publish date.
- Re-run the existing RSS `podcast:transcript` extraction on the matched feed item.

Risk:

- It does not solve the core problem when the publisher has not exposed a transcript.

### 3. Taddy Free Tier For Publisher-Provided Transcripts

Taddy documents transcript access, but its free path is mainly useful when the podcast already provides its own transcript. Generated or on-demand transcripts are paid.

Possible use:

- Use Taddy as an alternate directory lookup for episodes that already have publisher-provided transcripts.
- Avoid generated transcript endpoints unless a paid-provider decision is made.

Risk:

- If the app already finds and parses the canonical RSS feed, this may add limited coverage.
- Provider limits, pricing, and terms must be rechecked before implementation.

### 4. YouTube Captions From Explicit Publisher Links

Some podcasts publish the same episode on YouTube and link that exact video from show notes. In those cases, a future provider could consider using available YouTube caption tracks for the linked video, without downloading podcast audio or running ASR.

Possible use:

- Parse show notes for explicit YouTube video links.
- Require conservative evidence that the video is the same episode.
- Fetch available caption tracks only through documented/public mechanisms.

Risks:

- Terms, auth, quota, and availability need fresh review.
- Matching the podcast episode to a video can be unreliable.
- Automatically generated captions may raise quality and attribution questions.

### 5. Publisher Transcript Pages Linked In Show Notes

Some publishers link a transcript article or episode page from RSS show notes. A future provider could fetch those public links and run the existing article extraction pipeline.

Possible use:

- Scan RSS item descriptions and show notes for links with transcript-like text or URL patterns.
- Fetch only public HTTP(S) pages that pass the existing SSRF and content safety checks.
- Normalize with the existing safe HTML extraction and markdown cleanup path.

Risks:

- Many publisher pages block server-side fetches or require browser/session context.
- Paywalls and bot challenges must fail clearly rather than being bypassed.
- False positives are easy, so matching should be conservative.

### 6. GitHub And Open-Source Libraries

Most open-source podcast transcript tools ultimately download audio, call an ASR model/API, scrape unofficial surfaces, or require a third-party API key. Those are useful for separate research, but they are outside the current free/no-audio/no-ASR boundary.

Acceptable future use:

- Reuse format parsers, caption normalizers, or RSS helpers with compatible licenses.

Not acceptable under the current boundary:

- A library whose core value is downloading audio and transcribing it.
- A library that depends on private app APIs or brittle scraping of closed transcript UI.

### 7. Public Static Datasets

Public transcript datasets may be useful for experiments or evaluation, but they are not a good fit for arbitrary user-submitted podcast URLs.

Risk:

- Dataset coverage, licensing, freshness, and episode matching are usually not strong enough for product behavior.

## Possible Later Architecture

If this becomes a real milestone, keep the current item semantics and add a provider chain behind the existing resolver:

```text
rssTranscriptProvider
directTranscriptProvider
podcastIndexMetadataProvider
publisherLinkedTranscriptProvider
youtubeCaptionsProvider
```

The chain should return one of three outcomes:

- `resolved`: normalized transcript markdown plus source metadata.
- `confident_unavailable`: the URL is a podcast episode, but no allowed public transcript source was found.
- `not_applicable`: keep normal URL or HTML snapshot behavior.

Implementation notes:

- Keep `PODCAST_TRANSCRIPT` forced to `SUMMARY_ONLY`.
- Keep failures visible as failed Recent items.
- Keep all optional providers behind explicit environment flags.
- Store provider/source metadata for diagnostics, but do not store secrets or large raw transcript bodies.
- Add quota accounting to summary quota only.
- Preserve digest/wiki eligibility for successful transcript summaries.

## Acceptance Criteria For A Future Milestone

- Existing M122 tests still pass unchanged.
- Apple episode URLs with RSS `podcast:transcript` still resolve through the current path first.
- Optional providers only run after the baseline RSS/direct transcript path fails.
- No future provider downloads audio, runs ASR, creates audio/RSS/media artifacts, or enables request-TTS for `PODCAST_TRANSCRIPT`.
- Provider failures produce machine-readable extraction errors and safe user-facing messages.
- Non-podcast URL paste and normal Chrome extension capture behavior remain unchanged.
- Terms, pricing, rate limits, and license compatibility are documented before adding any dependency or API integration.

## Research Checklist Before Reopening

- Re-check Apple Podcasts public docs for any newly documented transcript API.
- Re-check PodcastIndex, Taddy, and YouTube terms, limits, and pricing.
- Validate whether a provider can be used without downloading audio or running ASR.
- Validate license compatibility for any open-source library.
- Test coverage against a small sample set of Apple Podcasts URLs, including shows with and without RSS transcript tags.
- Confirm SSRF, private-network, file-size, content-type, and redirect protections apply to every fetched URL.
- Decide whether extension-captured publisher transcript pages should be suggested to users when server fetch is blocked.

## Reference Links

- Apple Podcasts creator docs for transcripts: https://podcasters.apple.com/support/5316-transcripts-on-apple-podcasts
- Podcasting 2.0 `podcast:transcript` tag: https://podcastnamespace.org/tag/transcript
- PodcastIndex API docs: https://podcastindex-org.github.io/docs-api/
- Taddy episode transcript docs: https://taddy.org/developers/podcast-api/episode-transcripts
- YouTube Data API caption resource docs: https://developers.google.com/youtube/v3/docs/captions
