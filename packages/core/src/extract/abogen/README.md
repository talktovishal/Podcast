# Abogen Port

This folder contains the runtime extraction helpers copied/adapted from
`denizsafak/abogen` and reviewed for minimal, extraction-only reuse.

## Reviewed upstream snapshot
- Repository: `https://github.com/denizsafak/abogen`
- License: MIT
- Source branch: `main`
- Reviewed runtime snapshot: commit `ca5c5ee62dd26009ae6d946c562e69a3d279841e`
- Snapshot commit date: `2026-03-06`
- Snapshot commit summary: `Merge pull request #146 from olandir/131wVoiceTags`
- Review date in this repo: `2026-03-25`

## Important runtime note
- `abogen` does not provide direct URL article fetching or article-body isolation.
- ArticlePod's active HTML path remains `Readability + abogen-derived cleanup`.
- The runtime composition is:
  - URL and snapshot fetch/parsing orchestration: `packages/core/src/extract/html.ts`
  - Article isolation: `@mozilla/readability`
  - Cleanup helpers derived from `abogen`: this folder

## Upstream files reviewed
- `abogen/subtitle_utils.py`
- `abogen/text_extractor.py`

## Local file mapping
- `cleanText.ts`
  - local export: `cleanTextWithAbogenRules`
  - upstream basis: `abogen/subtitle_utils.py:clean_text`
- `htmlToText.ts`
  - local exports:
    - `extractNarrationTextFromHtml`
    - `resolveTitleFromHtmlWithAbogenFallback`
  - upstream basis:
    - `abogen/text_extractor.py:_html_to_text`
    - `abogen/text_extractor.py:_resolve_document_title`
- `pdfClean.ts`
  - local export: `cleanPdfTextWithAbogenRules`
  - upstream basis: `abogen/text_extractor.py:_clean_pdf_text`

## Diff map
### Matches upstream behavior
- Metadata-tag removal in text cleanup.
- Whitespace normalization and line trimming.
- Optional single-newline collapsing while preserving paragraph breaks.
- Ordered-list numbering preservation in HTML-to-text conversion.
- Block-level line break insertion to preserve narration pauses.
- `sup` and `sub` removal before narration text extraction.
- PDF cleanup for bracketed citations and trailing page-number noise.

### Local additions
- `Readability`-based article isolation lives outside `abogen` in `packages/core/src/extract/html.ts`.
- Extra HTML noise removal for `script`, `style`, `noscript`, `template`, `svg`, `canvas`, `figure`, `figcaption`, and caption-like nodes.
- Local title fallback helper is used in the URL article path after Readability extraction.
- Local URL canonicalization, SSRF-safe DNS handling, pinned-IP fetch logic, hostname fallback, interstitial detection, and extraction error mapping all live outside this folder.
- Local HTML extraction also produces markdown output for downstream artifact reuse.

### Intentionally not imported
- PyQt/UI and queue-management code.
- Voice-marker and word-substitution features.
- Subtitle parsing features beyond the small `clean_text` helper we mirror.
- EPUB, markdown, and book-structure extraction flows.
- Broader metadata, cover-image, and chapter-packaging features.
- Any upstream runtime concerns not directly required for ArticlePod's HTML/PDF cleanup path.

## Safe reuse rule
- Keep this folder limited to small, attribution-friendly extraction helpers.
- Do not pull in broader upstream application code unless there is a separate, explicit review for that scope.
- Any future upstream adoption should be minimal and behavior-driven.

## Next review starting point
- Start from upstream commit `ca5c5ee62dd26009ae6d946c562e69a3d279841e`.
- Diff only these upstream files first:
  - `abogen/subtitle_utils.py`
  - `abogen/text_extractor.py`
- Compare only against these local files first:
  - `packages/core/src/extract/abogen/cleanText.ts`
  - `packages/core/src/extract/abogen/htmlToText.ts`
  - `packages/core/src/extract/abogen/pdfClean.ts`
- Ignore unrelated upstream churn unless scope changes:
  - PyQt/UI
  - voice markers
  - word substitution
  - EPUB/book packaging
