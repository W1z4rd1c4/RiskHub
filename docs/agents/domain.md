# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

**Layout: single-context.** RiskHub keeps one set of architectural decisions at the repo
root (`docs/adr/`) and a `CONTEXT.md` glossary at the repo root. `/grill-with-docs` and
`/domain-modeling` extend `CONTEXT.md` lazily as terms get resolved.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary (ubiquitous language), or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. (Not used: RiskHub is single-context.)
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. RiskHub currently has ADR-001 … ADR-010 (capabilities, service-owned transactions, exception taxonomy, UTC datetime SSOT, archivable mixin, snapshot testing, bounded-context taxonomy, risk-threshold SSOT, reserved surfaces, Postgres migration rehearsal).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

RiskHub is a single-context repo:

```
/
├── CONTEXT.md            ← domain glossary; extended via /grill-with-docs
├── docs/adr/
│   ├── ADR-001-capabilities-module-unification.md
│   ├── ...
│   └── ADR-010-postgres-migration-rehearsal-contract.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-007 (bounded-context taxonomy) — but worth reopening because…_
