from __future__ import annotations

import re
import tomllib
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ADR_007 = REPO_ROOT / "docs/adr/ADR-007-bounded-context-taxonomy.md"
WORKFLOW_PAIRS = REPO_ROOT / "tests/backend/pytest/architecture/_bounded_context_workflow_pairs.toml"
WRITE_SIDE = REPO_ROOT / "tests/backend/pytest/architecture/_bounded_context_write_side.toml"


def _heading_sections() -> dict[tuple[str, ...], list[str]]:
    sections: dict[tuple[str, ...], list[str]] = {}
    stack: list[str] = []
    current: tuple[str, ...] | None = None

    for line in ADR_007.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            title = line[level:].strip()
            stack = stack[: level - 1]
            stack.append(title)
            current = tuple(stack)
            sections.setdefault(current, [])
            continue
        if current is not None:
            sections[current].append(line)

    return sections


def _classification_rows() -> dict[str, dict[str, str]]:
    sections = _heading_sections()
    lines = sections[(
        "ADR-007 Bounded Context Taxonomy",
        "Amendment 1 — Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Contexts",
        "Classification Table",
    )]
    table_lines = [line for line in lines if line.startswith("|")]
    header = [cell.strip() for cell in table_lines[0].strip("|").split("|")]
    rows: dict[str, dict[str, str]] = {}
    for line in table_lines[2:]:
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        row = dict(zip(header, cells, strict=True))
        package = row["Package"].strip("`")
        assert package not in rows, f"Duplicate ADR package: {package}"
        rows[package] = row
    return rows


def test_amendment_section_exists() -> None:
    sections = _heading_sections()
    assert (
        "ADR-007 Bounded Context Taxonomy",
        "Amendment 1 — Read-Shape, Workflow-Paired, Adapter, and Cross-cutting Contexts",
    ) in sections


def test_amendment_uses_cross_cutting_not_core() -> None:
    rows = _classification_rows()
    assert rows["_authorization_capabilities"]["Category"] == "Cross-cutting"
    assert rows["_config"]["Category"] == "Cross-cutting"
    assert "Core" not in {row["Category"] for row in rows.values()}


def _assert_workflow_pair_equality() -> None:
    rows = _classification_rows()
    documented = []
    for package, row in rows.items():
        category = row["Category"]
        if not category.startswith("Workflow-paired"):
            continue
        match = re.fullmatch(r"Workflow-paired \(`([^`]+)`\)", category)
        assert match is not None, f"Malformed workflow category: {category}"
        documented.append((package, match.group(1)))
    registered = [
        (pair["left"], pair["right"])
        for pair in tomllib.loads(WORKFLOW_PAIRS.read_text())["pairs"]
    ]
    # ADR sweep coupling is reciprocal (↔), including two Issue table rows.
    # TOML orientation still controls primary classification in the separate
    # disjointness lock; equality here checks coupling, not that orientation.
    documented_pairs = {tuple(sorted(pair)) for pair in documented}
    registered_pairs = {tuple(sorted(pair)) for pair in registered}
    assert len(registered) == len(registered_pairs), "Duplicate workflow registry pair"
    assert len({left for left, _ in registered}) == len(registered), "Duplicate workflow owner"
    assert documented_pairs == registered_pairs, {
        "missing_from_registry": documented_pairs - registered_pairs,
        "missing_from_adr": registered_pairs - documented_pairs,
    }


def test_amendment_workflow_pairs_equal_registry() -> None:
    _assert_workflow_pair_equality()


def test_write_side_contexts_equal_adr_decision_and_table() -> None:
    registered = set(tomllib.loads(WRITE_SIDE.read_text())["packages"])
    documented = {
        package for package, row in _classification_rows().items()
        if row["Category"].startswith("Write-side")
    }
    decision = "\n".join(_heading_sections()[("ADR-007 Bounded Context Taxonomy", "Decision")])
    enumerated = set(re.findall(r"`(_[a-z_]+)`", decision))
    assert registered == documented == enumerated


@pytest.mark.parametrize("mutation", ["substitute", "remove", "add", "duplicate", "reversed_duplicate"])
def test_workflow_pair_lock_rejects_seeded_registry_violation(tmp_path, monkeypatch, mutation):
    original = WORKFLOW_PAIRS.read_text()
    if mutation == "substitute":
        changed = original.replace('left = "_approval_queue"', 'left = "_wrong_pair"', 1)
    elif mutation == "remove":
        changed = original.replace('[[pairs]]\nleft = "_approval_queue"\nright = "_approval_execution"', '', 1)
    elif mutation == "add":
        changed = original + '\n[[pairs]]\nleft = "_unexpected"\nright = "_approval_execution"\n'
    elif mutation == "reversed_duplicate":
        changed = original + '\n[[pairs]]\nleft = "_approval_execution"\nright = "_approval_queue"\n'
    else:
        changed = original + '\n[[pairs]]\nleft = "_approval_queue"\nright = "_approval_execution"\n'
    assert changed != original
    target = tmp_path / "workflow_pairs.toml"
    target.write_text(changed)
    monkeypatch.setitem(_assert_workflow_pair_equality.__globals__, "WORKFLOW_PAIRS", target)
    with pytest.raises(AssertionError):
        _assert_workflow_pair_equality()


def test_amendment_cross_references_graph_directory_post_61() -> None:
    row = _classification_rows()["_graph_directory"]
    assert row["Category"] == "Adapter"
    assert row["Enforcement TOML"] == "`_bounded_context_adapters.toml`"


def test_workflow_pair_lock_rejects_duplicate_adr_package(tmp_path, monkeypatch):
    original = ADR_007.read_text()
    row = next(line for line in original.splitlines() if line.startswith("| `_approval_queue` |"))
    target = tmp_path / "adr.md"
    target.write_text(original.replace(row, row + "\n" + row, 1))
    monkeypatch.setitem(_classification_rows.__globals__, "ADR_007", target)
    with pytest.raises(AssertionError, match="Duplicate ADR package"):
        _assert_workflow_pair_equality()
