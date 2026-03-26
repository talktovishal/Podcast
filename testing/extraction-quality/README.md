# Extraction Quality Audit Harness

This workspace focuses on extraction quality only. It does not enqueue jobs, write DB items, or synthesize audio.

It provides two reusable workflows:

- `artifact audit`: scan generated markdown artifacts already present under `apps/web/.data/media/`
- `bulk comparison`: run URL extraction and/or Chrome-extension snapshot extraction side by side on a corpus of URLs, then compare the cleaned markdown outputs

## Commands

From the repo root:

```bash
npm run extraction-quality:audit
npm run extraction-quality:test
npm run extraction-quality:test -- --limit 20
npm run extraction-quality:test:url -- --input /path/to/urls.txt
npm run extraction-quality:test:extension -- --site cnn-business,yahoo-news
```

## Corpus

- `corpus.md` is the checked-in sample corpus
- `--input <path>` accepts either:
  - a Markdown table with the same columns as `corpus.md`
  - a newline-delimited `.txt` file of URLs

## Output

Every run writes a timestamped bundle under:

```text
exports/extraction-quality/<timestamp>/
```

Audit runs write:

- `artifact-audit/summary.md`
- `artifact-audit/results.json`
- `artifact-audit/patterns.md`
- `artifact-audit/excerpts.md`

Bulk comparison runs write:

- `bulk/summary.md`
- `bulk/results.json`
- `bulk/patterns.md`
- `bulk/rerun-ids.txt`
- `bulk/targets/<id>/url.raw.md`
- `bulk/targets/<id>/url.cleaned.md`
- `bulk/targets/<id>/extension.raw.md`
- `bulk/targets/<id>/extension.cleaned.md`
- `bulk/targets/<id>/comparison.json`

## Defaults

- default corpus is the checked-in `corpus.md`
- URL concurrency defaults to `8`
- extension concurrency defaults to `3`
- comparison uses normalized cleaned markdown, not byte-for-byte equality
- popup/connect smoke remains in `testing/live-site/`; this harness uses the checked-in capture logic directly for scale

## Notes

- Artifact audit scope is intentionally narrow: generated item `source.md` plus digest `summary.md` and `email.md`
- Docs, worktrees, planning files, and exports are excluded by default
- If cleanup rules improve, you can refresh stored local artifacts with:

```bash
npm run artifacts:cleanup-markdown
```
