---
description: "GSD (Get Stuff Done) project management workflows"
globs: ["**/*"]
---

# GSD Workflow Rules

## Project Initialization
- `/new-project` — Start new project, creates `.planning/PROJECT.md`
- `/create-roadmap` — Define phases in `.planning/ROADMAP.md`
- `/map-codebase` — Analyze brownfield codebase with parallel agents

## Milestone Management
- `/discuss-milestone` — Plan next milestone after shipping
- `/new-milestone` — Create milestone section in roadmap
- `/complete-milestone` — Archive milestone, create git tag

## Phase Planning
- `/discuss-phase` — Gather context, create CONTEXT.md
- `/research-phase` — Ecosystem research for complex domains
- `/list-phase-assumptions` — See agent's planned approach
- `/plan-phase` — Generate detailed PLAN.md

## Execution
- `/execute-plan` — Run PLAN.md, create SUMMARY.md
- `/add-phase` — Add phase at end of milestone
- `/insert-phase` — Insert urgent work mid-milestone (e.g., 7.1)
- `/consider-issues` — Review deferred issues

## Session Management
- `/progress` — Check status, route to next action
- `/pause-work` — Preserve context mid-phase
- `/resume-work` — Restore context from previous session

## Quality
- `/qa-verify` — Run test suite before commit
- `/help` — Show all GSD commands

## Workflow Selection

| Situation | Workflow |
|-----------|----------|
| New project | `/new-project` → `/create-roadmap` |
| Resuming work | `/resume-work` or `/progress` |
| Starting phase | `/discuss-phase` → `/plan-phase` |
| After tests pass | `/add-phase` or `/complete-milestone` |
| Bug mid-milestone | `/insert-phase` |
