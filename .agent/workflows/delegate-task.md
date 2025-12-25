---
description: "Delegate a task to a sub-agent"
---

# Delegate Task Workflow

Use this workflow to hand off work to a sub-agent.

## Pre-Delegation Checklist
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
