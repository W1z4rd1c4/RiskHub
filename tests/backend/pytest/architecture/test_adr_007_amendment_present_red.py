from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ADR_007 = REPO_ROOT / "docs/adr/ADR-007-bounded-context-taxonomy.md"


def test_amendment_section_exists() -> None:
    text = ADR_007.read_text(encoding="utf-8")
    assert "## Amendment 1 — Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Contexts" in text


def test_amendment_uses_cross_cutting_not_core() -> None:
    text = ADR_007.read_text(encoding="utf-8")
    assert "Cross-cutting contexts" in text
    assert "Cross-cutting contexts: `_authorization_capabilities`, `_config`" in text


def test_amendment_lists_eleven_workflow_pairs() -> None:
    text = ADR_007.read_text(encoding="utf-8")
    assert "_orphaned_items` ↔ `_identity_access_lifecycle`" in text
    assert "_notification_inbox` ↔ `_identity_access_lifecycle`" in text


def test_amendment_cross_references_graph_directory_post_61() -> None:
    text = ADR_007.read_text(encoding="utf-8")
    assert "_graph_directory` (after the package move planned under finding 61)" in text or "_graph_directory" in text
