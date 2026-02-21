# Documentation Topology Audit — 2026-02-21

## Scope

- Canonical topology remediation and link integrity across:
  - `AGENTS.md`
  - `docs/`
  - `.planning/README.md`
  - `.planning/{PROJECT,STATE,ROADMAP}.md`
  - `.planning/codebase/*.md`
  - `.planning/phases/README.md`
- Full-scope visibility report includes `.planning/phases/*` archival files as a separate bucket.

## Commands Executed

```bash
python3 scripts/check_docs_contract.py
python3 scripts/tools/docs_tree_audit.py --scope canonical --output-dir tests/results/docs/docs-tree-audit-20260221-235000-canonical-final
python3 scripts/tools/docs_tree_audit.py --scope full --output-dir tests/results/docs/docs-tree-audit-20260221-235000-full-final
python3 scripts/tools/readme_coverage.py audit
```

## Results

| Check | Status | Evidence |
|---|---|---|
| Docs contract | PASS | `python3 scripts/check_docs_contract.py` |
| Docs-tree audit (canonical) | PASS | `tests/results/docs/docs-tree-audit-20260221-235000-canonical-final/docs-tree-audit.json` |
| Docs-tree audit (full) | PASS (canonical), archival issues separated | `tests/results/docs/docs-tree-audit-20260221-235000-full-final/docs-tree-audit.json` |
| README coverage | PASS | `python3 scripts/tools/readme_coverage.py audit` |

### Canonical Metrics

- Files scanned: `109`
- Links scanned: `610`
- Canonical unresolved links: `0`
- Missing required entrypoints: `0`
- Missing required cross-links: `0`

### Full Visibility Metrics

- Files scanned: `955`
- Links scanned: `862`
- Canonical unresolved links: `0`
- Archival unresolved links: `246`

## Interpretation

- Canonical tree integrity is clean and contract-compliant.
- Archival unresolved links remain concentrated in historical phase bodies and are intentionally tracked separately.
- Archive behavior aligns with policy: indexed and preserved, not bulk rewritten.

## Topology Artifacts

- Canonical JSON: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/docs-tree-audit-20260221-235000-canonical-final/docs-tree-audit.json`
- Canonical Markdown: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/docs-tree-audit-20260221-235000-canonical-final/docs-tree-audit.md`
- Full JSON: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/docs-tree-audit-20260221-235000-full-final/docs-tree-audit.json`
- Full Markdown: `/Users/stefanlesnak/Antigravity/Risk App 2/tests/results/docs/docs-tree-audit-20260221-235000-full-final/docs-tree-audit.md`
