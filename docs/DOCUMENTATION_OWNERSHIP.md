# Documentation and Work-Tracking Ownership

> **Owner**: RiskHub Maintainer  
> **Review trigger**: changes to repository entrypoints, planning topology, or work-tracking policy

This document defines which RiskHub surface is authoritative for each kind of
information. It prevents a live GitHub issue, a versioned planning file, and a
durable document from independently claiming the same status or rule.

## Operating Model

RiskHub has two complementary forms of current truth:

1. **Live delivery truth** — GitHub Issues, pull requests, and Projects record
   current scope, assignment, priority, review state, acceptance evidence, and
   open/closed status.
2. **Versioned repository truth** — code, tests, configuration, ADRs, durable
   documentation, and `.planning/` record the technical state and intent of a
   specific commit.

GitHub Issues and Projects are authoritative for live delivery status.

Neither form replaces the other. A pull request changes versioned repository
truth; its linked issue or project records the live delivery state around that
change. Agent default-work selection must confirm that live delivery state before
using `.planning/STATE.md`, `.planning/ROADMAP.md`, or a phase plan as
implementation context.

## Authority Matrix

| Information | Canonical surface | Accountable owner | Update trigger |
|---|---|---|---|
| Public product position and first-run commands | `README.md` | RiskHub Maintainer | Public install, product scope, or evaluation path changes |
| Human contribution contract | `CONTRIBUTING.md` | RiskHub Maintainer | Branch, review, verification, or contribution policy changes |
| General agent execution rules | `AGENTS.md` and `docs/agent/` | RiskHub Maintainer | Agent workflow or repository guardrail changes |
| Claude-specific orchestration deltas | `CLAUDE.md`, linking to `AGENTS.md` for general rules | RiskHub Maintainer | Claude tool or orchestration behavior changes |
| ICT Register domain vocabulary | `CONTEXT.md` | ICT Register domain owner | A canonical term, definition, or avoid-list changes |
| Implemented behavior | Code, tests, migrations, and runtime configuration at the referenced commit | Owning code reviewer | Every behavior change |
| Accepted architecture decisions | `docs/adr/` | Architecture owner | Decision accepted, amended, or superseded |
| Durable product and operating behavior | `docs/BUSINESS_LOGIC.md`, `docs/user/`, `docs/admin/`, deployment and security docs | Domain owner | User, operator, security, or deployment contract changes |
| Live delivery scope, priority, assignee, status, and acceptance evidence | GitHub Issues and Projects | Issue owner / maintainer | Any delivery-state change |
| Pull-request candidate, review discussion, checks, and merge decision | GitHub pull request | PR author and reviewers | Every candidate or review change |
| Versioned technical context and roadmap snapshot | `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/codebase/` | RiskHub Maintainer | A merged change alters technical state, roadmap intent, or repository map |
| Active phase implementation detail | The active `.planning/phases/*-PLAN.md`, subject to `AGENTS.md` precedence and live-status reconciliation | Phase owner | Scope or implementation sequence changes |
| Historical phase records | `.planning/phases/*-SUMMARY.md` and completed phase bodies | Phase owner | Append/correct provenance only; do not reuse as live status |
| Point-in-time audits and release evidence | `docs/audits/`, `docs/dora-ict-register/`, dated security reports | Named evidence owner | Additive disposition or new evidence; preserve dated findings |
| Generated/transient execution evidence | `tests/results/`, local logs, CI artifacts | Producing command or workflow | Never treated as canonical documentation; retain or delete under the owning evidence policy |

## Conflict Resolution

Do not silently choose whichever source is most convenient.

1. **Live status conflict**: GitHub Issues and Projects are authoritative for
   whether work is open, assigned, blocked, under review, or complete. Reconcile
   `.planning/STATE.md` or `.planning/ROADMAP.md` in the relevant delivery PR or
   the next explicit planning reconciliation. Agents must not select stale
   planning entries as default work.
2. **Implemented behavior conflict**: current code, tests, migrations, and
   configuration establish what the referenced commit does. Correct stale
   documentation. If an accepted ADR or product contract requires different
   behavior, treat the code as a defect rather than rewriting the decision.
3. **Active implementation conflict**: reconcile the issue acceptance criteria,
   active phase plan, and `AGENTS.md` before changing code. The explicit current
   task scope controls the delivery; update the other live/versioned surface so
   the discrepancy does not persist.
4. **Historical evidence conflict**: do not rewrite a dated audit or release
   record to match the present. Add a dated resolution, supersession, or
   correction with links to the new evidence.
5. **Unknown ownership**: stop representing the claim as canonical. Open or
   update an issue that names the owner and the source to be reconciled.

## Update Triggers

A change must update the authoritative surface in the same pull request when it
changes:

- a public command, URL, supported install path, or contribution rule;
- an API, authorization, workflow, transaction, deployment, or security
  contract;
- an accepted architecture decision;
- the repository structure described by `.planning/codebase/`;
- roadmap or technical-state claims in `.planning/STATE.md` or
  `.planning/ROADMAP.md`.

Issue assignment, priority, labels, check state, and closure remain live tracker
updates and do not require a repository commit unless they also change technical
scope or durable policy.

## Duplication Rule

Normative rules have one canonical home. Other documents should summarize the
rule only when needed for their audience and link to the canonical source.

Do not copy full command matrices, architecture rules, or live status tables
between `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, `docs/`, and
`.planning/`. Tool-specific instruction files must contain only tool deltas and
links to the general rule owner.

When duplication is necessary for usability:

- name the canonical source;
- keep the duplicate short;
- update both in one pull request;
- add a contract check when drift would create operational or security risk.

## Archival Boundary

The following are archival, not live trackers:

- completed `.planning/phases/*` plans and summaries;
- dated audit and release reports;
- historical implementation logs and evidence captures.

Generated `tests/results/`, local runtime logs, and CI artifacts are transient
evidence. They stay outside the active documentation tree and must not be linked
as durable truth unless a reviewed, immutable report records their identity and
disposition.

Archives may receive additive provenance or explicit corrections, but they must
not be edited to imply that past evidence described newer repository bytes.

## Validation

Run:

```bash
python3 scripts/tools/validate_documentation_ownership.py
python3 scripts/check_docs_contract.py
python3 scripts/tools/docs_tree_audit.py --scope canonical --max-root-hops 3 --fail-on-unreachable
```