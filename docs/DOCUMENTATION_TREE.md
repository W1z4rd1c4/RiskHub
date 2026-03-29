# RiskHub Documentation Tree

English-first master index for repository documentation topology.

## Root Entry Points

- [`/Users/stefanlesnak/Antigravity/Risk App 2/README.md`](../README.md): Repository quick start and canonical startup commands.
- [`/Users/stefanlesnak/Antigravity/Risk App 2/AGENTS.md`](../AGENTS.md): Agent behavior, source-of-truth order, execution protocol.
- [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/README.md`](./README.md): Product and engineering documentation index.
- [`/Users/stefanlesnak/Antigravity/Risk App 2/.planning/README.md`](../.planning/README.md): Planning state, roadmap, codebase maps, and phase archive entry.

## Tree Map

```text
AGENTS.md
├── docs/README.md
│   ├── docs/DOCUMENTATION_TREE.md (this file)
│   ├── docs/agent/README.md
│   ├── docs/development/README.md
│   ├── docs/security/README.md
│   ├── docs/deployment/README.md
│   ├── docs/reference/README.md
│   ├── docs/quality/README.md
│   ├── docs/assets/README.md
│   │   └── docs/assets/readme/README.md
│   ├── docs/admin/README.md
│   ├── docs/admin-cs/README.md
│   ├── docs/user/README.md
│   └── docs/user-cs/README.md
└── .planning/README.md
    ├── .planning/PROJECT.md
    ├── .planning/STATE.md
    ├── .planning/ROADMAP.md
    ├── .planning/codebase/*.md
    └── .planning/phases/README.md
        └── .planning/phases/* (archival records)
```

## Navigation By Intent

- Product/business behavior:
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/BUSINESS_LOGIC.md`](./BUSINESS_LOGIC.md)
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/user/README.md`](./user/README.md)
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/admin/README.md`](./admin/README.md)
- Security posture and audits:
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/security/README.md`](./security/README.md)
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/security/SECURITY.md`](./security/SECURITY.md)
- Development startup and local workflows:
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/development/README.md`](./development/README.md)
- Documentation screenshots and support assets:
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/assets/README.md`](./assets/README.md)
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/assets/readme/README.md`](./assets/readme/README.md)
- Deployment and operations:
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/deployment/README.md`](./deployment/README.md)
- Agent governance and execution:
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/agent/README.md`](./agent/README.md)
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/AGENTS.md`](../AGENTS.md)
- Active planning and current truth:
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/.planning/STATE.md`](../.planning/STATE.md)
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/.planning/ROADMAP.md`](../.planning/ROADMAP.md)
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/.planning/codebase/STRUCTURE.md`](../.planning/codebase/STRUCTURE.md)
- Historical planning archives:
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/.planning/phases/README.md`](../.planning/phases/README.md)
  - [`/Users/stefanlesnak/Antigravity/Risk App 2/docs/reference/LEGACY_PATH_MAP.md`](./reference/LEGACY_PATH_MAP.md) (historical path/archive reference)

## Canonical vs Archival Boundary

- Canonical documentation for active work:
  - `AGENTS.md`
  - `docs/`
  - `.planning/README.md`
  - `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`
  - `.planning/codebase/*.md`
  - `.planning/phases/README.md` (archive index only)
- Archival records:
  - `.planning/phases/*` plan/summaries are historical snapshots.
  - Legacy or absolute `file:///...` links may exist in archival bodies and are preserved as-is.

## Validation

Run topology validation from repo root:

```bash
python3 scripts/tools/docs_tree_audit.py --scope canonical --max-root-hops 3 --fail-on-unreachable
python3 scripts/tools/docs_tree_audit.py --scope full
python3 scripts/tools/structure_metrics_guard.py
```

## Reachability Contract

- Canonical leaf documents under `docs/` and `.planning/codebase/` must be reachable through markdown links from at least one root entrypoint (`AGENTS.md`, `docs/README.md`, `.planning/README.md`) within 3 hops.

Latest audit report location pattern:

- `tests/results/docs/docs-tree-audit-<timestamp>/docs-tree-audit.json`
- `tests/results/docs/docs-tree-audit-<timestamp>/docs-tree-audit.md`
