---
description: "Spawn multiple Codex subagents to investigate or work on a problem in parallel"
---

# Spawn Subagents Workflow

Use this workflow to spawn multiple Codex CLI subagents that work in parallel on different aspects of a problem.

## When to Use
- **Debugging complex issues** spanning multiple layers (UI, store, DB, auth, tests)
- **Research tasks** requiring multiple perspectives
- **Parallel implementation** of independent features or fixes

## Steps

### 1. Analyze the Problem
Before spawning, identify 3-5 distinct focus areas. Examples:
- UI/Frontend reactivity
- State management (stores)
- Database/persistence layer
- Authentication/integration
- Testing/reproduction

### 2. Create Task Brief for Each Subagent
Each subagent needs a focused, one-sentence prompt. Make it specific:
```
BAD:  "Fix the bug"
GOOD: "Analyze src/lib/stores/workout-session.ts. Focus: Async flow in loadToday. Check if Promise.all ever hangs."
```

### 3. Spawn Subagents in Parallel
// turbo-all
Use `codex exec` to spawn each subagent:
```bash
# Agent 1: UI Focus
codex exec "Analyze src/routes/workout/+page.svelte. Focus: Svelte 5 reactivity and $effect lifecycle."

# Agent 2: Store Focus
codex exec "Analyze src/lib/stores/workout-session.ts. Focus: Async state management."

# Agent 3: Database Focus
codex exec "Analyze src/lib/data/db.ts. Focus: IndexedDB operations and potential hangs."

# Agent 4: Auth Focus
codex exec "Analyze src/lib/auth/session.ts. Focus: Session initialization blocking."

# Agent 5: QA Focus
codex exec "Create tests/debug_issue.spec.ts using Playwright to reproduce the issue."
```

**Key flags:**
- Use `--model gpt-5.2-codex` for coding tasks
- Use `-c 'reasoning_effort="high"'` for complex debugging
- Use `--search` with `-c 'sandbox_workspace_write.network_access=true'` for web research

### 4. Monitor Subagent Progress
Use `command_status` tool with the returned command IDs to check:
- Status (RUNNING/DONE)
- Output delta
- Errors

Wait 10-30 seconds between checks. Terminate stuck agents if needed.# Pre-Delegation Checklist
- [ ] Task is well-scoped (single responsibility).
- [ ] Success criteria are measurable.
- [ ] Non-goals are explicitly stated.
- [ ] Constraints are documented.

## Task Brief Template
Fill this out before spawning a sub-agent:

```
Task: [One-line description]
Scope: [Files/directories to modify]
Non-goals: [What is NOT part of this task]
Constraints:
  - [e.g., No new dependencies]
  - [e.g., Follow existing code style]
Deliverables:
  - diff/patch file
  - Summary (max 5 bullets)
  - Test command: [e.g., npm test -- <suite>]
Success Criteria:
  - [e.g., All tests pass]
  - [e.g., Linter shows no errors]
```

## Steps

1. **Complete the Pre-Delegation Checklist.**
2. **Fill out the Task Brief Template.**
3. **Spawn Sub-Agent:**
   - Use Agent Manager or `codex exec`.
   - Pass the task brief as the initial prompt.
4. **Monitor:**
   - Wait for the sub-agent to report back.
   - Do not intervene unless asked or a blocker is reported.