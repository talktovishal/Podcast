# Third-Party Attribution

## Intended upstream references
- `iamspruce/postcast` (MIT): RSS generation and pipeline structuring inspiration.
- `denizsafak/abogen` (MIT): extraction and text-cleaning inspiration.

## Reuse policy
- Upstream repositories are kept as references only under `vendor/`.
- Runtime code lives in this repository's modules, including the upstream-derived
  modules identified below.
- Copied/adapted material must retain its source attribution and applicable
  copyright and permission notices. The project's inspection-only rights
  statement does not override those third-party licenses.

## Copied/adapted modules
- Source: `denizsafak/abogen` (MIT)
- Source commit: `ca5c5ee62dd26009ae6d946c562e69a3d279841e`
- Retained notice: [abogen MIT license](licenses/abogen-MIT.txt), verified against
  the [recorded upstream revision](https://github.com/denizsafak/abogen/blob/ca5c5ee62dd26009ae6d946c562e69a3d279841e/LICENSE).
- Destination: `packages/core/src/extract/abogen/`
- Files copied/adapted:
  - `packages/core/src/extract/abogen/cleanText.ts` (from `abogen/subtitle_utils.py:clean_text`)
  - `packages/core/src/extract/abogen/htmlToText.ts` (from `abogen/text_extractor.py:_html_to_text` and `_resolve_document_title`)
  - `packages/core/src/extract/abogen/pdfClean.ts` (from `abogen/text_extractor.py:_clean_pdf_text`)
- Detailed reviewed snapshot ledger and diff notes live in `packages/core/src/extract/abogen/README.md`.

- Source: `iamspruce/postcast` (MIT)
- Source commit: `5574cf43e42a68679f27bbe6670efb249ad8ce53`
- Retained notice: [postcast MIT license](licenses/postcast-MIT.txt).
  The port's README separately records `b881b68fb9189e5d0abf7a40722a82288afe3f75`.
  Both [the ledger revision](https://github.com/iamspruce/postcast/blob/5574cf43e42a68679f27bbe6670efb249ad8ce53/LICENSE)
  and [the port README revision](https://github.com/iamspruce/postcast/blob/b881b68fb9189e5d0abf7a40722a82288afe3f75/LICENSE)
  carry the same copyright and license notice. This notice update preserves both
  existing provenance records rather than asserting a new source snapshot.
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

## Framework scaffold

- Next.js scaffold material, including the default SVG assets retained under
  `apps/web/public/`, is attributed to Vercel.
- The scaffold addition commit `be72a8d36b0e8f53b5c96e00415fa09ca75bc523`
  declared Next.js `14.2.24`. Its
  [upstream license](https://github.com/vercel/next.js/blob/v14.2.24/license.md)
  is retained as [Next.js MIT notice](licenses/nextjs-MIT.txt).

## Scope of this ledger

These notices cover the identified copied material above, not a blanket license
for ArticlePod. Installed dependencies and separately downloaded models/assets
retain their own licenses and notices. This ledger is not an exhaustive legal
clearance of every dependency, historical artifact, or content source.
