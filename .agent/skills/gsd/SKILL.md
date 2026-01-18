---
name: gsd
description: Get-Shit-Done (GSD) meta-prompting system overview. Use this for general questions about GSD principles, context engineering, and the spec-driven development methodology.
---

# GET SHIT DONE (GSD) Core

GSD is a power-prompting and context engineering system. For specific actions (initialization, planning, execution), specialized GSD skills will be loaded automatically based on your intent.

## Core Principles

1. **Context Engineering**: Load only what is needed for the current task.
2. **Spec-Driven**: Every change is guided by requirements and roadmaps.
3. **Phase-Based**: Work is divided into atomic phases.
4. **Research First**: Investigate the domain before planning.
5. **Atomic Commits**: Every task execution gets a git commit.

## Antigravity Adaptation: Single-Agent Orchestration

In Antigravity, sequential execution steps (via `Task()`) are not supported. This system has been adapted for **Single-Agent Sequential Orchestration**:

- **Sequential Execution**: Where original GSD instructions suggest "running sequential passes," you should execute those specialized tasks (research, mapping, planning) sequentially within your own session.
- **Aggregated Reasoning**: Use your large context window to synthesize multiple focus areas (e.g., Tech, Architecture, Quality) without needing separate "synthesizer" passes.
- **Direct Action**: Follow the GSD workflows step-by-step manually rather than delegating to background processes.

## Granular GSD Skills

The following specialized skills are available and will be loaded dynamically:

- `gsd-new-project`: Initialization and roadmap creation.
- `gsd-map-codebase`: Understanding existing code.
- `gsd-discuss-phase`: Capturing preferences.
- `gsd-plan-phase`: Research and task planning.
- `gsd-execute-phase`: Implementation and commits.
- `gsd-verify-work`: Manual and automated UAT.

The core assets (templates, references, agents) are maintained in `.agent/skills/gsd/`.
