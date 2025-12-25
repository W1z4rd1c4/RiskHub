# Agent Orchestration Guide

This document teaches the agent when and how to use each workflow in this repository.

---

## Core Orchestration Workflows

### `/delegate-task`
**When to use:** Decompose complex tasks into bounded sub-tasks for parallel execution.
**How:** Define Task, Scope, Non-goals, Constraints, and Deliverables before spawning.

### `/review-merge`
**When to use:** After sub-agents complete their work, review artifacts and merge approved changes.
**How:** Collect diffs, summaries, and test outputs; verify quality before merging.

### `/spawn`
**When to use:** Debug complex issues spanning multiple layers or parallelize research/implementation.
**How:** Create focused prompts for each subagent (e.g., UI, Store, DB, Auth, QA), then run `codex exec` for each.

---

## Subagent Spawning Rules

**ALWAYS spawn subagents for:**
- Debugging issues that span 2+ system layers (UI, state, DB, auth, network)
- Research tasks requiring multiple perspectives or sources
- Parallel implementation of independent features or fixes
- Codebase analysis across multiple components
- Any task where 3-5 focused investigations would be faster than one sequential analysis

**NEVER spawn subagents for:**
- Simple single-file edits
- Quick questions or explanations
- Tasks requiring sequential dependencies (output of A needed for B)

### Subagent Prompt Rules

**DO:**
```
"Analyze src/lib/stores/workout-session.ts. Focus: Async flow in loadToday. Check if Promise.all ever hangs."
```

**DON'T:**
```
"Fix the bug"
```

Each prompt must have:
1. **Specific file/component** to analyze
2. **Focused investigation area** (one concern per agent)
3. **Clear deliverable** (what to check, find, or create)

### Spawning Command Patterns

**For coding/debugging tasks:**
```bash
codex exec --skip-git-repo-check --full-auto "PROMPT"
```

**For complex reasoning:**
```bash
codex exec --skip-git-repo-check --full-auto -c 'reasoning_effort="high"' "PROMPT"
```

**For web research:**
```bash
codex --search exec --skip-git-repo-check --full-auto "PROMPT"
```

### Standard Focus Areas (pick 3-5)

| Focus | Example Prompt |
|-------|----------------|
| **UI/Frontend** | "Analyze src/routes/page.svelte. Focus: Reactivity and lifecycle hooks." |
| **State Management** | "Analyze src/lib/stores/*.ts. Focus: Async state updates and race conditions." |
| **Database** | "Analyze src/lib/data/db.ts. Focus: IndexedDB operations and transaction handling." |
| **Auth/Sessions** | "Analyze src/lib/auth/*.ts. Focus: Session initialization and token refresh." |
| **QA/Testing** | "Create tests/debug_issue.spec.ts to reproduce the reported issue." |
| **Research** | "Search the web for best practices on [topic]. Summarize top 3 approaches." |

### Monitoring and Synthesis

1. **Launch all agents in parallel** (do not wait between spawns)
2. **Monitor with `command_status`** every 10-30 seconds
3. **Terminate stuck agents** if no progress after 60 seconds
4. **Synthesize findings** once all complete:
   - Collect key insights from each agent
   - Identify common themes or root causes
   - Create unified fix plan
   - Implement the solution

### Efficiency Guidelines

- **Spawn early**: If a task looks complex, spawn immediately rather than investigating sequentially first
- **Parallelize aggressively**: 5 agents running 30 seconds each = 30 seconds total, not 2.5 minutes
- **Keep prompts atomic**: One agent, one concern—never give an agent multiple unrelated tasks
- **Use high reasoning effort** for debugging; medium for routine analysis

---


## GSD (Get Stuff Done) Project Management

### `/new-project`
**When to use:** Starting a brand new project.
**How:** Initializes `.planning/PROJECT.md` with vision and requirements.

### `/create-roadmap`
**When to use:** After project initialization, to define phases.
**How:** Creates `.planning/ROADMAP.md` with phase breakdown.

### `/map-codebase`
**When to use:** Brownfield projects needing codebase analysis.
**How:** Runs parallel agents to produce `.planning/codebase/` documents.

### `/discuss-milestone`
**When to use:** Planning the next milestone after shipping.
**How:** Reviews previous milestone and helps identify next features.

### `/new-milestone`
**When to use:** Creating a new milestone for an existing project.
**How:** Adds milestone section to roadmap, creates phase directories.

### `/complete-milestone`
**When to use:** After all phases in a milestone are done.
**How:** Archives milestone, creates git tag, prepares for next version.

### `/discuss-phase`
**When to use:** Before planning a phase, to gather context.
**How:** Creates CONTEXT.md with vision, essentials, and boundaries.

### `/research-phase`
**When to use:** Complex or niche domains needing ecosystem research.
**How:** Creates RESEARCH.md with architecture patterns and pitfalls.

### `/list-phase-assumptions`
**When to use:** Before executing, to see what the agent plans to do.
**How:** Outputs assumptions without creating files.

### `/plan-phase`
**When to use:** Creating a detailed execution plan for a phase.
**How:** Generates `.planning/phases/XX-name/XX-YY-PLAN.md`.

### `/execute-plan`
**When to use:** Running a prepared PLAN.md.
**How:** Executes tasks sequentially, creates SUMMARY.md, updates STATE.md.

### `/add-phase`
**When to use:** Adding a new phase at the end of the current milestone.
**How:** Appends to ROADMAP.md with next sequential number.

### `/insert-phase`
**When to use:** Inserting urgent work mid-milestone.
**How:** Creates decimal phase (e.g., 7.1 between 7 and 8).

### `/consider-issues`
**When to use:** Reviewing deferred issues against codebase state.
**How:** Identifies resolved, urgent, or phase-fit issues.

### `/progress`
**When to use:** Checking project status and routing to next action.
**How:** Shows progress bar, recent work, and offers next steps.

### `/pause-work`
**When to use:** Pausing work mid-phase with context preservation.
**How:** Creates `.continue-here` file and updates STATE.md.

### `/resume-work`
**When to use:** Resuming work from a previous session.
**How:** Reads STATE.md, shows current position, offers next actions.

### `/qa-verify`
**When to use:** Before committing, to verify feature readiness.
**How:** Runs full test suite and validates changes.

### `/help`
**When to use:** Displaying available GSD commands.
**How:** Outputs the complete command reference.

---

## Development Workflows

### `/algorithmic-art`
**When to use:** User requests generative art, flow fields, particle systems, or p5.js creations.
**How:** Use seeded randomness, Perlin noise, and color palettes for reproducible art.

### `/backend-development`
**When to use:** Designing APIs, database schemas, microservices, or backend architecture.
**How:** Apply test-driven development and best practices for Python/Node backends.

### `/frontend-design`
**When to use:** Building web components, pages, dashboards, or styling UI.
**How:** Create production-grade interfaces with modern design principles.

### `/javascript-typescript`
**When to use:** Frontend, backend, or full-stack JS/TS projects.
**How:** Use ES6+, Node.js, React, and modern frameworks.

### `/python-development`
**When to use:** Python projects, APIs, data processing, or automation.
**How:** Use Python 3.12+, Django, FastAPI, async patterns.

### `/database-design`
**When to use:** Schema design, migrations, or query optimization.
**How:** Apply best practices for PostgreSQL, MySQL, or NoSQL.

### `/llm-application-dev`
**When to use:** Building AI-powered features, chatbots, or RAG systems.
**How:** Use prompt engineering, retrieval-augmented generation patterns.

### `/mcp-builder`
**When to use:** Creating MCP servers to integrate external APIs.
**How:** Use Python (FastMCP) or Node/TypeScript (MCP SDK).

---

## Code Quality Workflows

### `/code-review`
**When to use:** Reviewing code changes, PRs, or doing audits.
**How:** Analyze for quality, security, performance, and best practices.

### `/code-refactoring`
**When to use:** Cleaning up legacy code or reducing complexity.
**How:** Apply refactoring patterns without changing behavior.

### `/code-documentation`
**When to use:** Writing API docs, READMEs, or inline comments.
**How:** Create clear technical documentation for developers.

---

## Testing Workflows

### `/qa-regression`
**When to use:** Automating regression testing with reusable scenarios.
**How:** Create login flows, dashboard checks, and consistent test scripts.

### `/webapp-testing`
**When to use:** Testing local web applications using Playwright.
**How:** Verify frontend, debug UI, capture screenshots, view logs.

---

## Documentation Workflows

### `/doc-coauthoring`
**When to use:** Writing proposals, specs, decision docs, or structured content.
**How:** Transfer context, refine iteratively, verify readability.

### `/changelog-generator`
**When to use:** Creating user-facing changelogs from git commits.
**How:** Analyze commit history, categorize, and transform to release notes.

### `/internal-comms`
**When to use:** Writing status reports, newsletters, FAQs, or incident reports.
**How:** Use company formats for internal communications.

---

## File Manipulation Workflows

### `/pdf`
**When to use:** Extracting text, creating PDFs, merging/splitting, or filling forms.
**How:** Use PDF toolkit for programmatic document processing.

### `/docx`
**When to use:** Creating or editing Word documents with tracked changes.
**How:** Preserve formatting, add comments, extract text.

### `/xlsx`
**When to use:** Creating, editing, or analyzing spreadsheets.
**How:** Work with formulas, formatting, and data visualization.

### `/pptx`
**When to use:** Creating or editing presentations.
**How:** Work with layouts, speaker notes, and content.

---

## Utility Workflows

### `/web-search`
**When to use:** Researching information online.
**How:** Use search tools and synthesize findings.

### `/prompt-enhancer`
**When to use:** Improving simple prompts for AI agents.
**How:** Transform into detailed, actionable instructions.

### `/skill-creator`
**When to use:** Creating or updating skills for specialized capabilities.
**How:** Define name, description, instructions, and optional assets.

### `/use-skills`
**When to use:** Learning how to discover and invoke available skills.
**How:** List skills, invoke with `$skill-name`, match task to skill.

### `/theme-factory`
**When to use:** Styling artifacts with themes (slides, docs, landing pages).
**How:** Apply 10 pre-set themes or generate custom ones.

### `/slack-gif-creator`
**When to use:** Creating animated GIFs for Slack.
**How:** Use validators and animation primitives for optimized GIFs.

### `/image-enhancer`
**When to use:** Improving screenshot quality for presentations or docs.
**How:** Enhance resolution, sharpness, and clarity.

### `/video-downloader`
**When to use:** Downloading videos for offline viewing or editing.
**How:** Handle various formats and quality options.

---

## Business Workflows

### `/brand-guidelines`
**When to use:** Applying brand colors and typography to artifacts.
**How:** Ensure consistency with visual formatting standards.

### `/canvas-design`
**When to use:** Creating posters, visual art, or static design pieces.
**How:** Generate original visual designs in PNG/PDF.

### `/competitive-ads-extractor`
**When to use:** Analyzing competitor ads from ad libraries.
**How:** Extract messaging, problems, and creative approaches.

### `/content-research-writer`
**When to use:** Writing content with research, citations, and feedback.
**How:** Conduct research, improve hooks, iterate on outlines.

### `/domain-name-brainstormer`
**When to use:** Generating domain name ideas and checking availability.
**How:** Check across multiple TLDs (.com, .io, .dev, .ai).

### `/file-organizer`
**When to use:** Organizing files, finding duplicates, automating cleanup.
**How:** Understand context and suggest better structures.

### `/invoice-organizer`
**When to use:** Organizing invoices for tax preparation.
**How:** Read files, extract info, rename consistently, sort logically.

### `/jira-issues`
**When to use:** Creating or managing Jira tickets from natural language.
**How:** Log bugs, create tickets, update status.

### `/job-application`
**When to use:** Writing tailored cover letters and applications.
**How:** Use CV and preferred style for customization.

### `/lead-research-assistant`
**When to use:** Identifying leads for sales or business development.
**How:** Analyze business, search targets, provide contact strategies.

### `/meeting-insights-analyzer`
**When to use:** Analyzing meeting transcripts for communication insights.
**How:** Identify patterns, filler words, and improvement areas.

### `/developer-growth-analysis`
**When to use:** Analyzing coding patterns and development gaps.
**How:** Review chat history, curate resources, send growth reports.

### `/raffle-winner-picker`
**When to use:** Picking random winners for giveaways or contests.
**How:** Ensure fair, unbiased selection from lists or spreadsheets.

---

## Directory Structure

```
.agent/
├── rules/main-agent.md        # Orchestrator rules
├── workflows/                  # All workflows (flattened)
│   ├── algorithmic-art.md
│   ├── backend-development.md
│   ├── ... (41 skill workflows)
│   ├── delegate-task.md
│   ├── spawn.md
│   └── gsd/                   # 19 GSD workflows
├── references/                 # GSD reference docs
└── templates/                  # GSD templates

.codex/skills/                  # Original skill definitions
```

---

## Roles

**Main Agent:** Decomposes tasks, delegates to sub-agents, reviews artifacts, merges changes.
**Sub-Agents:** Execute bounded tasks, report with diffs/summaries/tests, never commit directly.
