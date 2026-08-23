#!/usr/bin/env python3
"""Validate documentation and work-tracking authority without duplicating policy."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OWNERSHIP = REPO_ROOT / "docs/DOCUMENTATION_OWNERSHIP.md"
AGENTS = REPO_ROOT / "AGENTS.md"
CODEX_RULES = REPO_ROOT / "docs/agent/CODEX_WORKING_RULES.md"
AGENT_COVERAGE = REPO_ROOT / "docs/agent/AGENTS_DOC_COVERAGE.md"
CLAUDE = REPO_ROOT / "CLAUDE.md"
CONTEXT = REPO_ROOT / "CONTEXT.md"

REQUIRED_LINKS = {
    REPO_ROOT / "docs/README.md": "DOCUMENTATION_OWNERSHIP.md",
    REPO_ROOT / "docs/DOCUMENTATION_TREE.md": "DOCUMENTATION_OWNERSHIP.md",
    REPO_ROOT / ".planning/README.md": "../docs/DOCUMENTATION_OWNERSHIP.md",
    REPO_ROOT / "CONTRIBUTING.md": "docs/DOCUMENTATION_OWNERSHIP.md",
    AGENTS: "docs/DOCUMENTATION_OWNERSHIP.md",
    CODEX_RULES: "../DOCUMENTATION_OWNERSHIP.md",
    CLAUDE: "docs/DOCUMENTATION_OWNERSHIP.md",
}

REQUIRED_HEADINGS = {
    "## Operating Model",
    "## Authority Matrix",
    "## Conflict Resolution",
    "## Update Triggers",
    "## Duplication Rule",
    "## Archival Boundary",
    "## Validation",
}

REQUIRED_TERMS = {
    "CLAUDE.md",
    "CONTEXT.md",
    "GitHub Issues and Projects",
    ".planning/STATE.md",
    "Live delivery truth",
    "Versioned repository truth",
    "Historical phase records",
    "Generated/transient execution evidence",
    "Agent default-work selection",
    "General agent precedence and default-work selection",
}

CANONICAL_NORMATIVE_STATEMENTS = {
    "GitHub Issues and Projects are authoritative for live delivery status.",
    "Normative rules have one canonical home.",
}

GOVERNANCE_SURFACES = (
    REPO_ROOT / "README.md",
    REPO_ROOT / "CONTRIBUTING.md",
    AGENTS,
    CODEX_RULES,
    CLAUDE,
    CONTEXT,
    REPO_ROOT / ".planning/README.md",
)

CLAUDE_FORBIDDEN_GENERAL_SECTIONS = {
    "## Architecture Locks",
    "## Authorization Capability Contract",
    "## client_factory",
    "## RiskHub v5 conventions",
}

AGENTS_REQUIRED_TERMS = {
    "referenced GitHub Issue, pull request, or Project item",
    "versioned technical context",
    "Do not start work solely because a planning snapshot says it is in progress.",
    "| Source-of-Truth Order | `AGENTS.md`<br>`docs/DOCUMENTATION_OWNERSHIP.md`",
    "| Active Work Focus (Default Bias) | `AGENTS.md`<br>`docs/DOCUMENTATION_OWNERSHIP.md`",
    "Canonical Source: this section in `AGENTS.md`, `docs/DOCUMENTATION_OWNERSHIP.md`, `.planning/codebase/CONVENTIONS.md`",
    "Canonical Source: this section in `AGENTS.md`, `docs/DOCUMENTATION_OWNERSHIP.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`",
}

AGENTS_FORBIDDEN_TERMS = {
    ".planning/STATE.md` (current truth of progress)",
    "Unless user redirects, prioritize unresolved work identified as in progress in:",
    "| Source-of-Truth Order | `docs/agent/CODEX_WORKING_RULES.md`",
    "| Active Work Focus (Default Bias) | `docs/agent/CODEX_WORKING_RULES.md`",
    "Canonical Source: `docs/agent/CODEX_WORKING_RULES.md`, `docs/DOCUMENTATION_OWNERSHIP.md`, `.planning/codebase/CONVENTIONS.md`",
    "Canonical Source: `docs/agent/CODEX_WORKING_RULES.md`, `docs/DOCUMENTATION_OWNERSHIP.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`",
}

CODEX_REQUIRED_LINKS = {
    "../../AGENTS.md#source-of-truth-order",
    "../../AGENTS.md#active-work-focus-default-bias",
    "../DOCUMENTATION_OWNERSHIP.md",
}

CODEX_FORBIDDEN_DUPLICATION = {
    "## Active Work Focus (Default Bias)",
    "Use this precedence when instructions or status claims conflict:",
    "1. Explicit user request for the current task.",
    "2. The referenced GitHub Issue, pull request, or Project item",
    "3. The active phase plan",
}

CONTEXT_FORBIDDEN_POLICY = {
    "## Source-of-Truth Order",
    "## Active Work Focus (Default Bias)",
    "GitHub Issues and Projects are authoritative for live delivery status.",
    ".planning/STATE.md` (current truth of progress)",
}

PLANNING_SURFACE_CONTRACTS = {
    REPO_ROOT / ".planning/README.md": {
        "versioned technical state",
        "GitHub Issues, pull requests, and Projects",
        "DOCUMENTATION_OWNERSHIP.md",
    },
    REPO_ROOT / ".planning/codebase/STRUCTURE.md": {
        "versioned repository-structure snapshot",
        "Live scope, assignment, priority, review state, blocking, and closure",
        "DOCUMENTATION_OWNERSHIP.md",
    },
    REPO_ROOT / ".planning/phases/README.md": {
        "historical phase plans and summaries",
        "Confirm live scope, assignment, priority, blocking, review state, and closure",
        "DOCUMENTATION_OWNERSHIP.md",
    },
    REPO_ROOT / "docs/DOCUMENTATION_TREE.md": {
        "Versioned planning context (live status remains in GitHub)",
        "Live delivery state:",
        "DOCUMENTATION_OWNERSHIP.md",
    },
}

FORBIDDEN_UNQUALIFIED_TRUTH_CLAIMS = {
    "Active Planning Truth",
    "current execution truth",
    "For current active truth",
    "Active planning and current truth",
    "Canonical documentation for active work",
    ".planning/STATE.md` (current truth of progress)",
}


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _validate_ownership_document() -> list[str]:
    errors: list[str] = []
    if not OWNERSHIP.is_file():
        return [f"missing authority document: {OWNERSHIP.relative_to(REPO_ROOT)}"]

    ownership_text = _read(OWNERSHIP)
    for heading in sorted(REQUIRED_HEADINGS):
        if heading not in ownership_text:
            errors.append(f"authority document is missing heading: {heading}")
    for term in sorted(REQUIRED_TERMS):
        if term not in ownership_text:
            errors.append(f"authority document is missing required term: {term}")
    for statement in sorted(CANONICAL_NORMATIVE_STATEMENTS):
        if statement not in ownership_text:
            errors.append(f"authority document is missing normative statement: {statement}")
    if (
        "General agent precedence and default-work selection | `AGENTS.md`"
        not in ownership_text
    ):
        errors.append("authority matrix must make AGENTS.md the agent-policy owner")

    return errors


def _validate_links_and_normative_duplication() -> list[str]:
    errors: list[str] = []
    for path, link in REQUIRED_LINKS.items():
        if not path.is_file():
            errors.append(f"missing index file: {path.relative_to(REPO_ROOT)}")
            continue
        if link not in _read(path):
            errors.append(
                f"{path.relative_to(REPO_ROOT)} does not link to the authority document"
            )

    for path in GOVERNANCE_SURFACES:
        if not path.is_file():
            errors.append(f"missing governance surface: {path.relative_to(REPO_ROOT)}")
            continue
        text = _read(path)
        for statement in CANONICAL_NORMATIVE_STATEMENTS:
            if statement in text:
                errors.append(
                    f"{path.relative_to(REPO_ROOT)} duplicates canonical normative statement: {statement}"
                )
    return errors


def _validate_agent_surfaces() -> list[str]:
    errors: list[str] = []
    agents_text = _read(AGENTS)
    for term in sorted(AGENTS_REQUIRED_TERMS):
        if term not in agents_text:
            errors.append(f"AGENTS.md is missing agent authority term: {term}")
    for term in sorted(AGENTS_FORBIDDEN_TERMS):
        if term in agents_text:
            errors.append(f"AGENTS.md retains conflicting agent authority: {term}")

    codex_text = _read(CODEX_RULES)
    for link in sorted(CODEX_REQUIRED_LINKS):
        if link not in codex_text:
            errors.append(f"Codex rules do not link canonical policy: {link}")
    for duplicate in sorted(CODEX_FORBIDDEN_DUPLICATION):
        if duplicate in codex_text:
            errors.append(f"Codex rules duplicate general agent policy: {duplicate}")

    coverage_text = _read(AGENT_COVERAGE)
    source_row = next(
        (
            line
            for line in coverage_text.splitlines()
            if line.startswith("| source_of_truth_order |")
        ),
        "",
    )
    active_row = next(
        (
            line
            for line in coverage_text.splitlines()
            if line.startswith("| active_work_focus |")
        ),
        "",
    )
    for row_name, row in (
        ("source_of_truth_order", source_row),
        ("active_work_focus", active_row),
    ):
        if not row:
            errors.append(f"agent coverage manifest is missing {row_name}")
            continue
        for required in ("`AGENTS.md`", "`docs/DOCUMENTATION_OWNERSHIP.md`"):
            if required not in row:
                errors.append(f"agent coverage {row_name} is missing {required}")
        if "`docs/agent/CODEX_WORKING_RULES.md`" in row:
            errors.append(
                f"agent coverage {row_name} incorrectly treats Codex deltas as policy owner"
            )
        if "2026-08-24" not in row:
            errors.append(f"agent coverage {row_name} has not been reverified")

    return errors


def _validate_tool_and_domain_surfaces() -> list[str]:
    errors: list[str] = []
    claude_text = _read(CLAUDE)
    for heading in sorted(CLAUDE_FORBIDDEN_GENERAL_SECTIONS):
        if heading in claude_text:
            errors.append(
                f"CLAUDE.md duplicates general repository guidance section: {heading}"
            )
    if "[AGENTS.md](AGENTS.md)" not in claude_text:
        errors.append("CLAUDE.md must link to AGENTS.md for general repository rules")

    context_text = _read(CONTEXT)
    if not context_text.startswith("# ICT Register\n"):
        errors.append("CONTEXT.md must remain the ICT Register domain glossary")
    for policy in sorted(CONTEXT_FORBIDDEN_POLICY):
        if policy in context_text:
            errors.append(f"CONTEXT.md attempts to own work-tracking policy: {policy}")

    return errors


def _validate_planning_boundaries() -> list[str]:
    errors: list[str] = []
    for path, required_terms in PLANNING_SURFACE_CONTRACTS.items():
        if not path.is_file():
            errors.append(f"missing planning boundary surface: {path.relative_to(REPO_ROOT)}")
            continue
        text = _read(path)
        for required in sorted(required_terms):
            if required not in text:
                errors.append(
                    f"{path.relative_to(REPO_ROOT)} is missing boundary term: {required}"
                )
        for forbidden in sorted(FORBIDDEN_UNQUALIFIED_TRUTH_CLAIMS):
            if forbidden in text:
                errors.append(
                    f"{path.relative_to(REPO_ROOT)} retains unqualified truth claim: {forbidden}"
                )
    return errors


def validate() -> list[str]:
    return [
        *_validate_ownership_document(),
        *_validate_links_and_normative_duplication(),
        *_validate_agent_surfaces(),
        *_validate_tool_and_domain_surfaces(),
        *_validate_planning_boundaries(),
    ]


def main() -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"documentation-ownership error: {error}", file=sys.stderr)
        return 1
    print("Documentation ownership contract: valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
