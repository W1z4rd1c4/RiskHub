---
name: prompt-enhancer
description: Enhances simple prompts into detailed, actionable instructions for AI agents.
---

# Prompt Enhancer Skill

This skill transforms vague user requests into high-fidelity prompts that result in better AI performance.

## Usage
When a user provides a short or simple prompt, use this skill to expand it into a detailed specification.

## Methodology
Depending on the complexity of the prompt to be enhanced, choose the appropriate reasoning effort:
- **Medium**: For basic clarity improvements.
- **High**: For adding technical details and constraints.
- **Extra High**: For complex multi-part task specifications.

## Example
```bash
codex --model gpt-5.2-codex -c 'reasoning_effort="high"' exec "Enhance this prompt: 'make a fitness app'"
```
