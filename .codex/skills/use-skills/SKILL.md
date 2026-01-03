---
name: use-skills
description: "Teach agent how to use Codex Skills"
---

# Use Skills Workflow

This workflow teaches agents how to discover and use available Codex Skills.

## What are Skills?
Skills are reusable capabilities defined in `SKILL.md` files that extend what an agent can do. Each skill contains:
- **Name & Description:** For discovery and selection.
- **Instructions:** Steps for the agent to follow.
- **Optional:** Scripts, references, assets.

## Skills Location
Skills are loaded from `.codex/skills/` in this repository.

## Models & Reasoning Effort

Codex supports multiple models and reasoning levels. Use the following methodology to choose the right combination for your task:

### Available Models
- **`gpt-5.2-codex`** (Default): Optimized for coding, logic, and long-running project work.
- **`gpt-5.2`**: General-purpose model for broader tasks.

### Reasoning Efforts
| Effort | Methodology |
|--------|-------------|
| **`medium`** | Default. Best for quick edits, explanations, and simple tasks. |
| **`high`** | Best for complex logic, cross-file refactoring, and finding subtle bugs. |
| **`extra-high`** (or `xhigh`) | Best for architectural design, large-scale migrations, and high-stakes reasoning. |

### How to Select
Pass the model via `--model` and the effort via configuration override:
```bash
codex --model gpt-5.2-codex -c 'reasoning_effort="high"' exec "your prompt"
```

## How to Use Skills

### 1. List Available Skills
```bash
ls .codex/skills/
```

Or ask Codex to list them.

### 2. Invoke a Skill
In the Codex CLI, prefix skill names with `$`:
```
$code-review    # Invoke code review skill
$python-development  # Python dev assistance
$skill-creator  # Create new skills
```

### 3. Skill Selection
Match your task to the appropriate skill:

| Task Type | Recommended Skills |
|-----------|-------------------|
| Code Quality | `$code-review`, `$code-refactoring`, `$code-documentation` |
| Development | `$python-development`, `$javascript-typescript`, `$backend-development`, `$frontend-design` |
| Database | `$database-design` |
| Testing | `$qa-regression`, `$webapp-testing` |
| Documentation | `$doc-coauthoring`, `$changelog-generator` |
| Content | `$content-research-writer`, `$brand-guidelines`, `$web-search`, `$prompt-enhancer` |
| Files | `$pdf`, `$docx`, `$xlsx`, `$pptx` |

## Creating New Skills
Use `$skill-creator` to bootstrap new skills:
```
$skill-creator "Create a skill for API testing"
```

## Available Skills (39)
```
algorithmic-art, artifacts-builder, backend-development, brand-guidelines,
canvas-design, changelog-generator, code-documentation, code-refactoring,
code-review, competitive-ads-extractor, content-research-writer,
database-design, developer-growth-analysis, doc-coauthoring, docx,
domain-name-brainstormer, file-organizer, frontend-design, image-enhancer,
internal-comms, invoice-organizer, javascript-typescript, jira-issues,
job-application, lead-research-assistant, llm-application-dev, mcp-builder,
meeting-insights-analyzer, pdf, pptx, prompt-enhancer, python-development, qa-regression,
raffle-winner-picker, skill-creator, slack-gif-creator, theme-factory,
video-downloader, webapp-testing, web-search, xlsx
```
