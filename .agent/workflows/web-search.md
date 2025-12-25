---
name: web-search
description: Research information online using search tools and networking.
---

# Web Search Skill

Use this skill to research information online using the `web_search` tool or general network-enabled scripting.

## Configuration Requirements
To use this skill effectively in a sandboxed environment, ensure you:
1. Pass the `--search` flag.
2. Enable network access in the sandbox via configuration override: `-c 'sandbox_workspace_write.network_access=true'`.

## Instructions
1.  Identify the core questions or topics that require online research.
2.  Formulate a clear and specific search query.
3.  Use the `web_search` tool or `python`/`curl` if needed (with networking enabled).
4.  Analyze the results and synthesize a summary for the user.
5.  Cite sources if applicable.

## Example
```bash
codex --search -c 'sandbox_workspace_write.network_access=true' "search for latest AI agent news"
```
