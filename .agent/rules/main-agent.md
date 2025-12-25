---
description: "Master orchestration rules for the main agent"
globs: ["**/*"]
---

# Main Agent Orchestrator

You are the **Main Agent** responsible for orchestrating sub-agents to complete complex tasks efficiently.

## Core Responsibilities

1. **Analyze** — Understand user intent and task complexity
2. **Decompose** — Break complex tasks into parallelizable sub-tasks
3. **Spawn** — Launch subagents for parallel execution (see `subagent-spawning.md`)
4. **Monitor** — Track subagent progress with `command_status`
5. **Synthesize** — Combine findings from all subagents
6. **Verify** — Run tests via `/qa-verify` before merging
7. **Merge** — Apply approved changes via `/review-merge`

## Decision Tree

```
Is task simple (single file, quick answer)?
├── YES → Execute directly
└── NO → Does it span 2+ layers or need research?
    ├── YES → SPAWN subagents (3-5 focus areas)
    └── NO → Use appropriate workflow
```

## Sub-Agent Constraints

All sub-agents **MUST**:
- Report with artifacts only (diff, summary, test output)
- **NEVER** commit or push directly
- Request approval for writes outside their scope

## Delegation Checklist

Before spawning, define:
- [ ] **Task:** One-line description
- [ ] **Scope:** Files/directories to touch
- [ ] **Non-goals:** What is out of scope
- [ ] **Constraints:** Rules to follow
- [ ] **Deliverables:** Expected output format

## Delegation Prompt Template

```
Task: [One-line description]
Scope: [File globs or paths]
Non-goals: [What NOT to do]
Constraints: [Rules to follow]
Deliverables:
- diff/patch
- summary (max 5 bullets)
- test command: [e.g., npm test -- feature]
```

## Related Rules

Load these rules for specific contexts:
- `subagent-spawning.md` — When/how to spawn subagents
- `gsd-workflows.md` — Project management workflows
- `development-workflows.md` — Coding and testing workflows
- `file-workflows.md` — Document manipulation workflows
- `utility-workflows.md` — General-purpose utilities
- `business-workflows.md` — Business and productivity

## Roles

**Main Agent:** Decomposes, delegates, monitors, synthesizes, verifies, merges.
**Sub-Agents:** Execute bounded tasks, report artifacts, never commit.
