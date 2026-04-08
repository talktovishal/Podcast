# Third-Party Attribution

## Intended upstream references
- `iamspruce/postcast` (MIT): RSS generation and pipeline structuring inspiration.
- `denizsafak/abogen` (MIT): extraction and text-cleaning inspiration.

## Reuse policy
- Upstream repositories are kept as references only under `vendor/`.
- Runtime code is implemented in this repository's own modules.
- Any copied snippets must keep source attribution in this document.

## Copied/adapted modules
- Source: `denizsafak/abogen` (MIT)
- Source commit: `ca5c5ee62dd26009ae6d946c562e69a3d279841e`
- Destination: `packages/core/src/extract/abogen/`
- Files copied/adapted:
  - `packages/core/src/extract/abogen/cleanText.ts` (from `abogen/subtitle_utils.py:clean_text`)
  - `packages/core/src/extract/abogen/htmlToText.ts` (from `abogen/text_extractor.py:_html_to_text` and `_resolve_document_title`)
  - `packages/core/src/extract/abogen/pdfClean.ts` (from `abogen/text_extractor.py:_clean_pdf_text`)
- Detailed reviewed snapshot ledger and diff notes live in `packages/core/src/extract/abogen/README.md`.

- Source: `iamspruce/postcast` (MIT)
- Source commit: `5574cf43e42a68679f27bbe6670efb249ad8ce53`
- Destination: `packages/core/src/extract/postcast/`
- Files copied/adapted:
  - `packages/core/src/extract/postcast/readability.ts`
  - `packages/core/src/extract/postcast/types.ts`
  - `packages/core/src/extract/postcast/cleanText.ts`
  - `packages/core/src/extract/postcast/rules/engine/ruleTypes.ts`
  - `packages/core/src/extract/postcast/rules/engine/pipeline.ts`
  - `packages/core/src/extract/postcast/rules/types.ts`
  - `packages/core/src/extract/postcast/rules/cleaners/*`

Runtime note:
- Current HTML/PDF extraction path uses `packages/core/src/extract/abogen/*` with Readability plus a `defuddle` comparison lane for URL and HTML-snapshot article isolation.
- `packages/core/src/extract/postcast/*` remains in-repo as an attributed reference implementation.

## Added runtime dependencies
- `stripe` (MIT)
  - Scope: `apps/web`
  - Purpose: hosted Checkout, hosted Customer Portal, and webhook verification for recurring billing without storing card data locally.
- `defuddle` (MIT)
  - Scope: `packages/core`
  - Purpose: secondary server-side HTML extraction and markdown-conversion lane used for scored runtime selection against the existing Readability path.
