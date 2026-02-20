# README Coverage Policy

## Scope

README coverage applies to directories that satisfy all of the following:
- path is not the repository root (`.`)
- no path segment starts with `.`
- directory is not ignored by git (`git check-ignore`)

## Accepted README Filenames

A directory is considered covered if it contains any of:
- `README`
- `README.md`
- `README.txt`

Matching is case-insensitive.

## Commands

Audit current coverage:

```bash
python3 scripts/tools/readme_coverage.py audit
```

Create missing `README.md` files:

```bash
python3 scripts/tools/readme_coverage.py apply
```

Generate reports:

```bash
python3 scripts/tools/readme_coverage.py audit \
  --report-json docs/reference/readme_coverage.json \
  --report-md docs/reference/readme_coverage.md
```

## Required Practice

When introducing a new in-scope folder, include README coverage in the same change set.

## Template Standard

Generated `README.md` files follow this short standard:
- `# <relative-folder-path>`
- `## Purpose`
- `## Contents`
- `## Notes`
