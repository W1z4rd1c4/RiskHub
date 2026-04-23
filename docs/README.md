# RiskHub Documentation Index

> **Version**: 1.4
> **Last Updated**: 2026-04-23
> **Audience**: Product, Engineering, QA, Operations

This file is the primary documentation index for `docs/`.

## Primary Navigation

- Repo quick start: [`README.md`](../README.md)
- Master tree (English-first): [`docs/DOCUMENTATION_TREE.md`](./DOCUMENTATION_TREE.md)
- Agent documentation index: [`docs/agent/README.md`](./agent/README.md)
- Planning tree root: [`.planning/README.md`](../.planning/README.md)

## Canonical Documentation Domains

| Domain | Purpose | Entry |
|---|---|---|
| Agent | Execution rules and AGENTS mappings | [`docs/agent/README.md`](./agent/README.md) |
| Development | Local startup and Docker development workflows | [`docs/development/README.md`](./development/README.md) |
| Security | Security policy, reports, and closure records | [`docs/security/README.md`](./security/README.md) |
| Audits | Point-in-time audit records for specific integrations or operating areas | [`docs/audits/README.md`](./audits/README.md) |
| Deployment | Runtime and production deployment guidance | [`docs/deployment/README.md`](./deployment/README.md) |
| Reference | Reference inventories and legacy path maps | [`docs/reference/README.md`](./reference/README.md) |
| Quality | Lint/debt baseline and ratchet references | [`docs/quality/README.md`](./quality/README.md) |
| Assets | Static screenshots and support assets for canonical docs | [`docs/assets/README.md`](./assets/README.md) |
| Admin (EN) | Platform administration runbooks | [`docs/admin/README.md`](./admin/README.md) |
| Admin (CS) | České admin runbooky | [`docs/admin-cs/README.md`](./admin-cs/README.md) |
| User (EN) | End-user/business operation manuals | [`docs/user/README.md`](./user/README.md) |
| User (CS) | České uživatelské manuály | [`docs/user-cs/README.md`](./user-cs/README.md) |

## Core Root Docs

- [`docs/BUSINESS_LOGIC.md`](./BUSINESS_LOGIC.md)
- [`docs/development/README.md`](./development/README.md)
- [`docs/TESTING.md`](./TESTING.md)
- [`docs/E2E_TESTING.md`](./E2E_TESTING.md)
- [`docs/LOCALIZATION.md`](./LOCALIZATION.md)
- [`docs/PERFORMANCE_BASELINE.md`](./PERFORMANCE_BASELINE.md)
- [`docs/AUTHZ_LIST_POLICY.md`](./AUTHZ_LIST_POLICY.md)
- [`docs/GLOSSARY.md`](./GLOSSARY.md)

Current operational truth for Docker-backed live verification is intentionally centralized in:

- [`docs/development/README.md`](./development/README.md)
- [`docs/TESTING.md`](./TESTING.md)
- [`docs/E2E_TESTING.md`](./E2E_TESTING.md)

## Validation Commands

```bash
python3 scripts/check_docs_contract.py
make -f scripts/Makefile docs-topology-consistency
cd backend && venv/bin/pytest ../tests/backend/pytest/test_admin_docs.py -q
cd ../frontend && npm run test:run -- src/components/settings/__tests__/DocumentationSettings.test.tsx
python3 scripts/tools/docs_tree_audit.py --scope canonical --max-root-hops 3 --fail-on-unreachable
python3 scripts/tools/docs_tree_audit.py --scope full
python3 scripts/tools/readme_coverage.py audit
python3 scripts/tools/structure_metrics_guard.py
```

Outputs:

- `tests/results/docs/docs-tree-audit-<timestamp>/docs-tree-audit.json`
- `tests/results/docs/docs-tree-audit-<timestamp>/docs-tree-audit.md`

## Boundary Notes

- Canonical docs for active operations are under `docs/`, `AGENTS.md`, `.planning/README.md`, `.planning/codebase/`, `.planning/{PROJECT,STATE,ROADMAP}.md`.
- `.planning/phases/*` is archival and indexed via [`.planning/phases/README.md`](../.planning/phases/README.md); historical phase bodies are preserved.
