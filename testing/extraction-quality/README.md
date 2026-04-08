# Extraction Quality Audit Harness

This workspace focuses on extraction quality only. It does not enqueue jobs, write DB items, or synthesize audio.

It provides two reusable workflows:

- `artifact audit`: scan generated markdown artifacts already present under `apps/web/.data/media/`
- `production audit`: scan production-generated summary markdown plus production episode text across all users from Azure Table + Blob
- `bulk comparison`: run URL extraction and/or Chrome-extension snapshot extraction side by side on a corpus of URLs, then compare the cleaned markdown outputs

## When To Use This

Use this harness when we want to answer questions like:

- does URL-path extraction still work across a large corpus?
- does the checked-in extension capture logic produce comparable markdown?
- what wrapper/footer junk is still leaking into persisted markdown?
- which failures are real site blocks versus product regressions?

## Commands

From the repo root:

```bash
npm run extraction-quality:audit
npm run extraction-quality:audit:prod -- --days 7
npm run extraction-quality:test
npm run extraction-quality:test -- --limit 20
npm run extraction-quality:test:url -- --input /path/to/urls.txt
npm run extraction-quality:test:extension -- --site cnn-business,yahoo-news
```

## On-Demand Workflow

If you give me a fresh set of URLs, the normal operator flow is:

1. Put the URLs into one of the supported input formats.
2. Run the extraction-only comparison suite against that file.
3. Inspect the timestamped report bundle under `exports/extraction-quality/<timestamp>/bulk/`.
4. Spot-check flagged targets by opening:
   - `summary.md`
   - `results.json`
   - `targets/<id>/url.cleaned.md`
   - `targets/<id>/extension.cleaned.md`
   - `targets/<id>/comparison.json`
   - `screenshots/*` for extension failures
5. If the findings point to deterministic cleanup or extraction regressions, fix the repo and rerun the impacted subset first.

Example commands:

```bash
npm run extraction-quality:test -- --input /tmp/my-urls.txt
npm run extraction-quality:test -- --mode url --input /tmp/my-urls.txt
npm run extraction-quality:test -- --mode extension --input /tmp/my-urls.txt
npm run extraction-quality:test -- --input /tmp/my-urls.txt --limit 25
```

## Corpus

- `corpus.md` is the checked-in sample corpus
- `--input <path>` accepts either:
  - a Markdown table with the same columns as `corpus.md`
  - a newline-delimited `.txt` file of URLs

### Spreadsheet Intake

If the URLs arrive in an Excel sheet, convert them into a newline-delimited text file before running the suite.

Install the optional spreadsheet helper dependency once:

```bash
python3 -m pip install -r testing/extraction-quality/requirements.txt
```

A common case in this repo is "URLs are in column E". This Python snippet extracts non-empty values from column `E`, skips a `url` header, deduplicates entries, and writes a `.txt` file that the harness can consume:

```bash
python3 - <<'PY'
from pathlib import Path
from openpyxl import load_workbook

source = Path("/absolute/path/to/urls.xlsx")
output = Path("/tmp/extraction-quality-input.txt")
seen = set()
urls = []

workbook = load_workbook(source, read_only=True, data_only=True)
for sheet in workbook.worksheets:
    for row in sheet.iter_rows(min_col=5, max_col=5, values_only=True):
        value = (row[0] or "").strip() if isinstance(row[0], str) else ""
        if not value or value.lower() == "url":
            continue
        if value not in seen:
            seen.add(value)
            urls.append(value)

output.write_text("\n".join(urls) + "\n", encoding="utf-8")
print(output)
PY
```

Then run:

```bash
npm run extraction-quality:test -- --input /tmp/extraction-quality-input.txt
```

The supported harness input remains `.txt` or Markdown, so the conversion step is still the handoff into the comparison suite.

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

Production audit runs write:

- `production-audit/summary.md`
- `production-audit/results.json`
- `production-audit/patterns.md`
- `production-audit/excerpts.md`

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

## Reading Results

Use these severity buckets as the first pass:

- `exact_match`: URL and extension cleaned markdown normalize to the same output
- `cosmetic_drift`: wording/formatting drift only after normalization
- `substantive_divergence`: both paths succeeded, but the extracted article content differs materially
- `cleanup_issue`: extraction succeeded, but one or both outputs still contain cleanup noise
- `capture_failure`: one or both paths failed before comparison

Common follow-up patterns:

- repeated `blocked access` on the URL lane usually means a real site block, not a product bug
- repeated extension failures with visible article screenshots usually indicate a server-side snapshot classification or cleanup bug
- `share_or_comment_noise`, `footer_legal`, `image_wrapper`, and narration-side `residual_url` / `table_markup` counts are usually the fastest way to spot cleanup regressions at scale
- for summary/digest artifacts, stored `Sources` / `References` appendices and source URLs are expected; treat them as regressions only when they leak into the narration-side issue counts

## Rerun Strategy

Start small after every fix:

```bash
npm run extraction-quality:test -- --input /tmp/my-urls.txt --limit 10
```

Then rerun the impacted subset:

```bash
npm run extraction-quality:test -- --site theverge-com-example,businessinsider-com-example
```

Then rerun the full corpus when the focused subset looks good.

## Notes

- Artifact audit scope is intentionally narrow: generated item `source.md` plus digest `summary.md` and `email.md`
- Production audit scope is read-only and uses Azure Table + Blob from the configured resource group to review:
  - successful manual summary markdown from the rolling lookback window
  - item episode source markdown for episodes published in that window
  - item episode descriptions and summary episode descriptions for that window
- Summary and digest artifact audits intentionally allow reusable stored markdown context such as source appendices, and focus on whether narration cleanup still strips URL/image/table/source residue before podcast output.
- Production audit reports separate cleanup residue from stub/trivial outputs so placeholder runs do not get confused with real cleanup regressions
- Docs, worktrees, planning files, and exports are excluded by default
- If cleanup rules improve, you can refresh stored local artifacts with:

```bash
npm run artifacts:cleanup-markdown
```
