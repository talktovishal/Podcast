# Abogen Port

This folder contains extraction and cleaning modules copied/adapted from:

- Repository: https://github.com/denizsafak/abogen
- License: MIT
- Source branch: `main`
- Source snapshot used: commit `d30415ffe7f7439ba04f78c0617c7a1fa41f9a12`

Notes:
- `abogen` does not include direct URL article fetching/extraction.
- ListenLater uses `@mozilla/readability` for article isolation, then applies
  the abogen-derived cleaners in this folder.
