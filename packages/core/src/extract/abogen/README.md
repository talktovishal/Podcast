# Abogen Port

This folder contains extraction and cleaning modules copied/adapted from:

- Repository: https://github.com/denizsafak/abogen
- License: MIT
- Source branch: `main`
- Source snapshot used: commit `ca5c5ee62dd26009ae6d946c562e69a3d279841e`

Notes:
- `abogen` does not include direct URL article fetching/extraction.
- ArticlePod uses `@mozilla/readability` for article isolation, then applies
  the abogen-derived cleaners in this folder.
- Active helpers in this folder are refreshed against the current upstream
  `abogen/subtitle_utils.py` and `abogen/text_extractor.py` cleaning logic.
