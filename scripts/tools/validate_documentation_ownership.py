#!/usr/bin/env python3
"""Validate documentation authority, planning snapshots, and archive topology."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OWNERSHIP = REPO_ROOT / "docs/DOCUMENTATION_OWNERSHIP.md"
AGENTS = REPO_ROOT / "AGENTS.md"
AGENT_INDEX = REPO_ROOT / "docs/agent/README.md"
AGENT_COVERAGE = REPO_ROOT / "docs/agent/AGENTS_DOC_COVERAGE.md"
EXECUTION_PROTOCOL = REPO_ROOT / "docs/agent/EXECUTION_PROTOCOL.md"
CODEX_RULES = REPO_ROOT / "docs/agent/CODEX_WORKING_RULES.md"
CLAUDE = REPO_ROOT / "CLAUDE.md"
CONTEXT = REPO_ROOT / "CONTEXT.md"
PLANNING_README = REPO_ROOT / ".planning/README.md"
PLANNING_STATE = REPO_ROOT / ".planning/STATE.md"
PLANNING_ROADMAP = REPO_ROOT / ".planning/ROADMAP.md"
PLANNING_STRUCTURE = REPO_ROOT / ".planning/codebase/STRUCTURE.md"
PHASE_INDEX = REPO_ROOT / ".planning/phases/README.md"
PLANNING_AUDIT_INDEX = REPO_ROOT / ".planning/audits/README.md"
DOCUMENTATION_TREE = REPO_ROOT / "docs/DOCUMENTATION_TREE.md"
DOCS_AUDIT_INDEX = REPO_ROOT / "docs/audits/README.md"
AUDIT_DISPOSITION = (
    REPO_ROOT / "docs/audits/legacy-planning-artifact-disposition-2026-08-24.md"
)
DECISION_LEDGER = (
    REPO_ROOT / "docs/audits/2026-05-09-architecture-cleanup-decisions.md"
)

REQUIRED_OWNERSHIP_HEADINGS = {
    "## Operating Model",
    "## Authority Matrix",
    "## Conflict Resolution",
    "## Update Triggers",
    "## Duplication Rule",
    "## Archival Boundary",
    "## Validation",
}

CANONICAL_NORMATIVE_STATEMENTS = {
    "GitHub Issues and Projects are authoritative for live delivery status.",
    "Normative rules have one canonical home.",
}

REQUIRED_LINKS = {
    REPO_ROOT / "docs/README.md": "DOCUMENTATION_OWNERSHIP.md",
    DOCUMENTATION_TREE: "DOCUMENTATION_OWNERSHIP.md",
    PLANNING_README: "../docs/DOCUMENTATION_OWNERSHIP.md",
    REPO_ROOT / "CONTRIBUTING.md": "docs/DOCUMENTATION_OWNERSHIP.md",
    AGENTS: "docs/DOCUMENTATION_OWNERSHIP.md",
    AGENT_INDEX: "../DOCUMENTATION_OWNERSHIP.md",
    CODEX_RULES: "../DOCUMENTATION_OWNERSHIP.md",
    CLAUDE: "docs/DOCUMENTATION_OWNERSHIP.md",
    PLANNING_AUDIT_INDEX: "../../docs/DOCUMENTATION_OWNERSHIP.md",
}

GOVERNANCE_SURFACES = (
    REPO_ROOT / "README.md",
    REPO_ROOT / "CONTRIBUTING.md",
    AGENTS,
    AGENT_INDEX,
    AGENT_COVERAGE,
    EXECUTION_PROTOCOL,
    CODEX_RULES,
    CLAUDE,
    CONTEXT,
    PLANNING_README,
    PLANNING_STATE,
    PLANNING_ROADMAP,
)

GENERAL_AGENT_HEADINGS = {
    "## Mission",
    "## Source-of-Truth Order",
    "## Active Work Focus (Default Bias)",
    "## Execution Protocol",
    "## Repo Hygiene",
    "## Prompting and Tooling Best Practices (OpenAI-Aligned)",
    "## Architecture Locks",
    "## Authorization Capability Contract",
    "## client_factory",
}

CODEX_REQUIRED_LINKS = {
    "../../AGENTS.md#mission",
    "../../AGENTS.md#source-of-truth-order",
    "../../AGENTS.md#active-work-focus-default-bias",
    "../../AGENTS.md#execution-protocol",
    "../../AGENTS.md#repo-hygiene",
    "../../AGENTS.md#prompting-and-tooling-best-practices-openai-aligned",
    "../DOCUMENTATION_OWNERSHIP.md",
}

AGENT_INDEX_REQUIRED_LINKS = {
    "../../AGENTS.md#mission",
    "../../AGENTS.md#source-of-truth-order",
    "../../AGENTS.md#active-work-focus-default-bias",
    "../../AGENTS.md#execution-protocol",
    "../../AGENTS.md#repo-hygiene",
    "../../AGENTS.md#prompting-and-tooling-best-practices-openai-aligned",
    "../../AGENTS.md#architecture-locks",
    "../../AGENTS.md#authorization-capability-contract",
    "../../AGENTS.md#client_factory",
}

CLAUDE_FORBIDDEN_GENERAL_SECTIONS = {
    "## Architecture Locks",
    "## Authorization Capability Contract",
    "## client_factory",
    "## RiskHub v5 conventions",
}

CONTEXT_FORBIDDEN_POLICY = {
    "## Source-of-Truth Order",
    "## Active Work Focus (Default Bias)",
    "GitHub Issues and Projects are authoritative for live delivery status.",
    ".planning/STATE.md` (current truth of progress)",
}

COVERAGE_POLICY_ROWS = {
    "mission",
    "source_of_truth_order",
    "active_work_focus",
    "execution_protocol",
    "repo_hygiene",
    "prompting_tooling_best_practices",
    "architecture_locks",
    "authorization_capability_contract",
    "client_factory",
}

EXECUTION_STEPS = (
    "Restate acceptance criteria and required output.",
    "Read the smallest relevant set of files first (`rg` then targeted opens).",
    "If phase-driven work: read plan + context + related summaries first.",
    "Keep diffs small and scoped to task intent.",
    "Preserve existing patterns in touched areas unless plan requires refactor.",
    "Update tests near changed behavior.",
    "Run the minimum meaningful verification for touched surface area.",
    "If phase plan requires it, add/update matching `*-SUMMARY.md`.",
    "If phase completion changes state, reconcile `.planning/STATE.md` and `.planning/ROADMAP.md`.",
)

TRANSIENT_PLANNING_ARTIFACTS = {
    REPO_ROOT / ".planning/audits/IMPLEMENTATION-LOG.md": (
        "ea4870061d0e6bfc082467e55d9484d8d40dd57f"
    ),
    REPO_ROOT / ".planning/audits/developer answer.md": (
        "adbca49a9294c5c2dfeb58fb699bbc0d12941503"
    ),
    REPO_ROOT / ".planning/audits/resolution-plan.md": (
        "6d3d2f5959360c2ab401579d223fe256cbf40689"
    ),
}

PLANNING_SURFACE_CONTRACTS = {
    PLANNING_README: {
        "commit-scoped technical context",
        "not a live work tracker",
        "audits/README.md",
        "GitHub Issues, pull requests, and Projects",
    },
    PLANNING_STATE: {
        "# Project State Snapshot: RiskHub",
        "versioned technical snapshot",
        "It is not a live delivery tracker",
        "GitHub Issue, pull request, or Project item",
    },
    PLANNING_ROADMAP: {
        "# Roadmap Snapshot: RiskHub",
        "Snapshot, not live status",
        "do not establish current work",
        "GitHub Issue, pull request, or Project item",
    },
    PLANNING_STRUCTURE: {
        "versioned repository-structure snapshot",
        "Live scope, assignment, priority, review state, blocking, and closure",
        "DOCUMENTATION_OWNERSHIP.md",
    },
    PHASE_INDEX: {
        "historical phase plans and summaries",
        "Confirm live scope, assignment, priority, blocking, review state, and closure",
        "DOCUMENTATION_OWNERSHIP.md",
    },
    DOCUMENTATION_TREE: {
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


def _coverage_row(text: str, section_id: str) -> str:
    prefix = f"| {section_id} |"
    return next((line for line in text.splitlines() if line.startswith(prefix)), "")


def _section(text: str, heading: str) -> str:
    start = text.find(heading)
    if start < 0:
        return ""
    end = text.find("\n## ", start + len(heading))
    return text[start:] if end < 0 else text[start:end]


def _validate_ownership_document() -> list[str]:
    errors: list[str] = []
    if not OWNERSHIP.is_file():
        return [f"missing authority document: {OWNERSHIP.relative_to(REPO_ROOT)}"]

    text = _read(OWNERSHIP)
    for heading in sorted(REQUIRED_OWNERSHIP_HEADINGS):
        if heading not in text:
            errors.append(f"authority document is missing heading: {heading}")
    for statement in sorted(CANONICAL_NORMATIVE_STATEMENTS):
        if statement not in text:
            errors.append(f"authority document is missing statement: {statement}")
    for required in (
        "General agent mission, precedence, default-work selection",
        "Detailed agent before/during/after execution procedure",
        "Codex-specific workflow and tooling deltas",
        "Versioned technical context and roadmap snapshot",
        "Generated/transient execution evidence",
    ):
        if required not in text:
            errors.append(f"authority matrix is missing: {required}")
    return errors


def _validate_links_and_normative_duplication() -> list[str]:
    errors: list[str] = []
    for path, link in REQUIRED_LINKS.items():
        if not path.is_file():
            errors.append(f"missing governance surface: {path.relative_to(REPO_ROOT)}")
            continue
        if link not in _read(path):
            errors.append(
                f"{path.relative_to(REPO_ROOT)} does not link the authority document"
            )

    for path in GOVERNANCE_SURFACES:
        if not path.is_file() or path == OWNERSHIP:
            continue
        text = _read(path)
        for statement in CANONICAL_NORMATIVE_STATEMENTS:
            if statement in text:
                errors.append(
                    f"{path.relative_to(REPO_ROOT)} duplicates canonical statement: "
                    f"{statement}"
                )
    return errors


def _validate_agent_surfaces() -> list[str]:
    errors: list[str] = []
    agents_text = _read(AGENTS)
    for heading in sorted(GENERAL_AGENT_HEADINGS):
        if heading not in agents_text:
            errors.append(f"AGENTS.md is missing canonical section: {heading}")
    for required in (
        "referenced GitHub Issue, pull request, or Project item",
        "versioned technical context",
        "Do not start work solely because a planning snapshot says it is in progress.",
        "| Mission | `AGENTS.md`",
        "| Repo Hygiene | `AGENTS.md`",
        "| Prompting and Tooling Best Practices (OpenAI-Aligned) | `AGENTS.md`",
        "| Architecture Locks | `AGENTS.md`",
        "| Authorization Capability Contract | `AGENTS.md`",
        "| client_factory | `AGENTS.md`",
    ):
        if required not in agents_text:
            errors.append(f"AGENTS.md is missing canonical ownership term: {required}")
    for forbidden in (
        "| Mission | `docs/agent/CODEX_WORKING_RULES.md`",
        "| Repo Hygiene | `.planning/codebase/STRUCTURE.md`<br>`docs/agent/CODEX_WORKING_RULES.md`",
        "| Prompting and Tooling Best Practices (OpenAI-Aligned) | `docs/agent/CODEX_WORKING_RULES.md`",
        "Canonical Source: `docs/agent/CODEX_WORKING_RULES.md`",
    ):
        if forbidden in agents_text:
            errors.append(f"AGENTS.md delegates canonical policy to Codex: {forbidden}")

    for heading in ("## Mission", "## Repo Hygiene", "## Prompting and Tooling Best Practices (OpenAI-Aligned)"):
        if "Canonical Source: this section in `AGENTS.md`" not in _section(
            agents_text, heading
        ):
            errors.append(f"AGENTS.md section does not own itself: {heading}")

    execution_text = _read(EXECUTION_PROTOCOL)
    for step in EXECUTION_STEPS:
        if step not in execution_text:
            errors.append(f"execution protocol is missing canonical step: {step}")
        for duplicate_path, duplicate_text in (
            (AGENTS, agents_text),
            (CODEX_RULES, _read(CODEX_RULES)),
            (CLAUDE, _read(CLAUDE)),
        ):
            if step in duplicate_text:
                errors.append(
                    f"{duplicate_path.relative_to(REPO_ROOT)} duplicates execution step: {step}"
                )

    codex_text = _read(CODEX_RULES)
    if not codex_text.startswith("# Codex-Specific Working Deltas\n"):
        errors.append("Codex rules must identify themselves as tool-specific deltas")
    for link in sorted(CODEX_REQUIRED_LINKS):
        if link not in codex_text:
            errors.append(f"Codex rules do not link canonical section: {link}")
    for heading in sorted(GENERAL_AGENT_HEADINGS):
        if heading in codex_text:
            errors.append(f"Codex rules duplicate general policy section: {heading}")

    index_text = _read(AGENT_INDEX)
    for link in sorted(AGENT_INDEX_REQUIRED_LINKS):
        if link not in index_text:
            errors.append(f"agent index does not link exact AGENTS anchor: {link}")
    for required in (
        "`AGENTS.md` owns general agent mission",
        "detailed before/during/after execution procedure is canonical",
        "Codex-specific deltas",
        "does not own mission",
    ):
        if required not in index_text:
            errors.append(f"agent index is missing ownership term: {required}")

    coverage_text = _read(AGENT_COVERAGE)
    for section_id in sorted(COVERAGE_POLICY_ROWS):
        row = _coverage_row(coverage_text, section_id)
        if not row:
            errors.append(f"agent coverage manifest is missing {section_id}")
            continue
        if "`AGENTS.md`" not in row:
            errors.append(f"agent coverage {section_id} must name AGENTS.md")
        if "`docs/agent/CODEX_WORKING_RULES.md`" in row:
            errors.append(f"agent coverage {section_id} makes Codex a policy owner")
        if "2026-08-24" not in row:
            errors.append(f"agent coverage {section_id} has not been reverified")
    return errors


def _validate_tool_and_domain_surfaces() -> list[str]:
    errors: list[str] = []
    claude_text = _read(CLAUDE)
    for heading in sorted(CLAUDE_FORBIDDEN_GENERAL_SECTIONS):
        if heading in claude_text:
            errors.append(f"CLAUDE.md duplicates general section: {heading}")
    if "[AGENTS.md](AGENTS.md)" not in claude_text:
        errors.append("CLAUDE.md must link AGENTS.md for general rules")

    context_text = _read(CONTEXT)
    if not context_text.startswith("# ICT Register\n"):
        errors.append("CONTEXT.md must remain the ICT Register glossary")
    for policy in sorted(CONTEXT_FORBIDDEN_POLICY):
        if policy in context_text:
            errors.append(f"CONTEXT.md attempts to own work policy: {policy}")
    return errors


def _validate_planning_boundaries() -> list[str]:
    errors: list[str] = []
    for path, required_terms in PLANNING_SURFACE_CONTRACTS.items():
        if not path.is_file():
            errors.append(f"missing planning boundary: {path.relative_to(REPO_ROOT)}")
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
                    f"{path.relative_to(REPO_ROOT)} retains live-truth claim: {forbidden}"
                )

    state_text = _read(PLANNING_STATE)
    for forbidden in (
        "## Current Position",
        "**Active Phases:**",
        "⏳ In progress",
    ):
        if forbidden in state_text:
            errors.append(f"STATE.md retains live-looking status: {forbidden}")

    roadmap_text = _read(PLANNING_ROADMAP)
    if re.search(r"(?m)^- \[[ xX]\]", roadmap_text):
        errors.append("ROADMAP.md must not expose live-looking task checkboxes")

    for path in (PLANNING_STATE, PLANNING_ROADMAP):
        text = _read(path)
        if re.search(r"\]\(\./codebase/\)", text):
            errors.append(
                f"{path.relative_to(REPO_ROOT)} must link concrete codebase files"
            )
    return errors


def _validate_artifact_topology() -> list[str]:
    errors: list[str] = []
    for path in (
        PLANNING_AUDIT_INDEX,
        AUDIT_DISPOSITION,
        DECISION_LEDGER,
        REPO_ROOT / ".planning/audits/2026-05-09-deepening-audit.md",
        REPO_ROOT / ".planning/audits/2026-05-17-architecture-improvement-plan.md",
    ):
        if not path.is_file():
            errors.append(f"missing retained audit surface: {path.relative_to(REPO_ROOT)}")

    for path in TRANSIENT_PLANNING_ARTIFACTS:
        if path.exists():
            errors.append(
                f"session-style planning artifact remains active: "
                f"{path.relative_to(REPO_ROOT)}"
            )

    if AUDIT_DISPOSITION.is_file():
        disposition = _read(AUDIT_DISPOSITION)
        for path, blob_sha in TRANSIENT_PLANNING_ARTIFACTS.items():
            if str(path.relative_to(REPO_ROOT)) not in disposition:
                errors.append(
                    f"audit disposition does not name removed path: "
                    f"{path.relative_to(REPO_ROOT)}"
                )
            if blob_sha not in disposition:
                errors.append(
                    f"audit disposition does not preserve blob identity: {blob_sha}"
                )

    if DECISION_LEDGER.is_file():
        ledger = _read(DECISION_LEDGER)
        for required in (
            "Decision #10",
            "Decision #57",
            "test_riskhub_questionnaires_module_present_red.py",
            "test_quarterly_comparison_facade_present_red.py",
        ):
            if required not in ledger:
                errors.append(f"decision ledger is missing: {required}")

    for path, required in (
        (PLANNING_AUDIT_INDEX, "legacy-planning-artifact-disposition-2026-08-24.md"),
        (DOCS_AUDIT_INDEX, "legacy-planning-artifact-disposition-2026-08-24.md"),
        (DOCS_AUDIT_INDEX, "2026-05-09-architecture-cleanup-decisions.md"),
        (PLANNING_README, "audits/README.md"),
    ):
        if path.is_file() and required not in _read(path):
            errors.append(
                f"{path.relative_to(REPO_ROOT)} does not link required audit record: {required}"
            )
    return errors


def validate() -> list[str]:
    return [
        *_validate_ownership_document(),
        *_validate_links_and_normative_duplication(),
        *_validate_agent_surfaces(),
        *_validate_tool_and_domain_surfaces(),
        *_validate_planning_boundaries(),
        *_validate_artifact_topology(),
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
