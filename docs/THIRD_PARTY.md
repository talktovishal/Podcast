# Third-Party Attribution

## Intended upstream references
- `iamspruce/postcast` (MIT): RSS generation and pipeline structuring inspiration.
- `denizsafak/abogen`: extraction pattern inspiration.

## Reuse policy
- Upstream repositories are kept as references only under `vendor/`.
- Runtime code is implemented in this repository's own modules.
- Any copied snippets must keep source attribution in this document.

## Copied/adapted modules
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
