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
### 1. Analyze the Problem
Use your best judgment to identify the necessary distinct focus areas.
- Determine the specific sub-tasks needed based on the current context.
- Identify relevant files and context for each sub-task.

### 2. Create Task Brief for Each Subagent
Each subagent needs a focused, one-sentence prompt. Make it specific:
```
BAD:  "Fix the bug"
GOOD: "Analyze src/lib/stores/workout-session.ts. Focus: Async flow in loadToday. Check if Promise.all ever hangs."
```

### 3. Spawn Subagents in Parallel
// turbo-all
### 3. Spawn Subagents in Parallel
// turbo-all
Use `codex exec` to spawn a subagent for each focus area you identified.
You must:
1. Decide on the specific task for the subagent.
2. Provide relevant filenames and context in the prompt.
3. Use `--sandbox read-only`.

```bash
# Template:
# codex exec --sandbox read-only "Analyze [LIST_RELEVANT_FILES]. Context: [PROVIDE_CONTEXT]. Focus: [SPECIFIC_GOAL]."

# Run your dynamically generated commands below:
```

**Key flags:**
- Use `--model gpt-5.2-codex` for coding tasks
- Use `-c 'reasoning_effort="high"'` for complex debugging
- Use `--search` with `-c 'sandbox_workspace_write.network_access=true'` for web research
- Use `--sandbox read-only` to prevent subagents from modifying files

### 4. Monitor Subagent Progress
Use `command_status` tool with the returned command IDs to check:
- Status (RUNNING/DONE)
- Output delta
- Errors

Wait 10-30 seconds between checks. ALWAYS wait for agents to finish (Status: DONE). Do NOT terminate agents unless they have errored.

# Pre-Delegation Checklist
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
   - ALWAYS wait for the sub-agent to complete (Status: DONE).
   - Do NOT terminate unless there is an error.