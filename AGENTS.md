# Agent Rules (concise)

This file keeps orchestration rules under 500 lines and points to the canonical workflows and skills.

## Canonical Sources
- Main orchestration rules: `.agent/rules/main-agent.md`
- Subagent spawning rules: `.agent/rules/subagent-spawning.md`
- Workflow catalogs: `.agent/rules/*-workflows.md`
- GSD workflows: `.agent/workflows/gsd/*.md`
- Skill workflows: `.agent/workflows/*.md`
- References: `.agent/references/*.md`
- Templates: `.agent/templates/*.md`
- Auto-discovered skills: `.codex/skills/*/SKILL.md`

## Default Behavior
- Prefer skills in `.codex/skills` when the user request matches a skill description.
- For complex tasks spanning 2+ layers, spawn subagents using the `/spawn` workflow.
- For simple, single-file edits or quick answers, execute directly without spawning.

## Skill Usage Rules
1. If the user names a skill (e.g., `/plan-phase`, `frontend-design`) or the task clearly matches a skill description, use that skill.
2. Open the skill's `SKILL.md` and follow its instructions before acting.
3. If a skill references files under `.agent/`, load only those referenced files.
4. Keep context minimal; do not bulk-load large folders.

## Subagent Rules (summary)
- Spawn subagents for multi-layer debugging, parallel research, or independent implementations.
- Each subagent prompt must include: specific file/component, a single focus area, and a clear deliverable.
- Launch subagents in parallel; monitor and synthesize results before implementing fixes.

## Execution Guardrails
- Do not revert unrelated changes.
- Do not run destructive commands unless explicitly requested.
- Follow sandbox and approval policies; request escalation only when required.

## When in Doubt
Load the relevant workflow or rule file from `.agent/` and follow it exactly.
