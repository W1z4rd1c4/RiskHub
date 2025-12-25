---
description: "Rules for spawning and managing subagents"
globs: ["**/*"]
---

# Subagent Spawning Rules

## When to Spawn

**ALWAYS spawn subagents for:**
- Debugging issues spanning 2+ system layers (UI, state, DB, auth, network)
- Research tasks requiring multiple perspectives
- Parallel implementation of independent features
- Codebase analysis across multiple components
- Tasks where 3-5 focused investigations beat sequential analysis

**NEVER spawn subagents for:**
- Simple single-file edits
- Quick questions or explanations
- Tasks with sequential dependencies (A's output needed for B)

## Prompt Rules

Each prompt must have:
1. **Specific file/component** to analyze
2. **Focused investigation area** (one concern per agent)
3. **Clear deliverable** (what to check, find, or create)

**Good:** `"Analyze src/lib/stores/session.ts. Focus: Async flow. Check if Promise.all hangs."`
**Bad:** `"Fix the bug"`

## Command Patterns

**Coding/debugging:**
```bash
codex exec --skip-git-repo-check --full-auto "PROMPT"
```

**Complex reasoning:**
```bash
codex exec --skip-git-repo-check --full-auto -c 'reasoning_effort="high"' "PROMPT"
```

**Web research:**
```bash
codex --search exec --skip-git-repo-check --full-auto "PROMPT"
```

## Focus Areas (pick 3-5)

| Focus | Example |
|-------|---------|
| UI/Frontend | Reactivity, lifecycle hooks |
| State | Async updates, race conditions |
| Database | Transactions, IndexedDB ops |
| Auth | Session init, token refresh |
| QA | Reproduce issue with tests |
| Research | Web search for best practices |

## Monitoring

1. Launch all agents in parallel
2. Monitor with command_status every 10-30s
3. Terminate stuck agents after 60s
4. Synthesize: collect insights, identify themes, create fix plan

## Efficiency

- **Spawn early** for complex tasks
- **Parallelize aggressively** (5 × 30s = 30s total)
- **Keep prompts atomic** (one agent, one concern)
- **High reasoning effort** for debugging
