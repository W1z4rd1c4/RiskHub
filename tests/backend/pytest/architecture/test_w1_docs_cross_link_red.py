from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract


ROOT = Path(__file__).resolve().parents[4]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_general_agent_review_closure_headings_live_in_agents_only() -> None:
    required_headings = (
        "## Architecture Locks",
        "## Authorization Capability Contract",
        "## client_factory",
    )

    agents = _read("AGENTS.md")
    claude = _read("CLAUDE.md")
    for heading in required_headings:
        assert heading in agents, f"AGENTS.md is missing {heading}"
        assert heading not in claude, f"CLAUDE.md duplicates {heading}"

    assert "[AGENTS.md](AGENTS.md)" in claude
    assert "docs/DOCUMENTATION_OWNERSHIP.md" in claude


def test_docs_index_cross_links_review_closure_surfaces() -> None:
    docs_readme = _read("docs/README.md")
    documentation_tree = _read("docs/DOCUMENTATION_TREE.md")
    combined = f"{docs_readme}\n{documentation_tree}"

    required_paths = (
        "tests/backend/pytest/architecture/",
        "tests/backend/pytest/_get_db_override_whitelist.toml",
        "backend/app/api/v1/endpoints/_reserved_modules.toml",
        "docs/security/authorization-capability-contract.md",
        "docs/security/capability-catalog.json",
        "docs/DOCUMENTATION_OWNERSHIP.md",
    )
    for path in required_paths:
        assert path in combined, f"docs index does not link {path}"
