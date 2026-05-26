from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
ISSUE_WORKFLOW_ROOT = REPO_ROOT / "backend/app/services/_issue_workflow"
IDENTITY_PATH_FILES = (
    ISSUE_WORKFLOW_ROOT / "assignment.py",
    ISSUE_WORKFLOW_ROOT / "execution.py",
    ISSUE_WORKFLOW_ROOT / "outbox.py",
)


def _source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _uuid_identity_offenders(source: str, *, label: str) -> list[str]:
    offenders: list[str] = []
    tree = ast.parse(source, filename=label)
    uuid_module_names: set[str] = set()
    uuid4_function_names: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "uuid":
                    uuid_module_names.add(alias.asname or alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module == "uuid":
            for alias in node.names:
                if alias.name == "uuid4":
                    uuid4_function_names.add(alias.asname or alias.name)
                    offenders.append(f"{label}:{node.lineno}")

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if isinstance(node.func, ast.Name) and node.func.id in uuid4_function_names | {"uuid4"}:
            offenders.append(f"{label}:{node.lineno}")
        elif (
            isinstance(node.func, ast.Attribute)
            and node.func.attr == "uuid4"
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id in uuid_module_names
        ):
            offenders.append(f"{label}:{node.lineno}")
    return offenders


@pytest.mark.parametrize(
    "source",
    [
        "from uuid import uuid4\nuuid4()\n",
        "from uuid import uuid4 as make_uuid\nmake_uuid()\n",
        "import uuid\nuuid.uuid4()\n",
        "import uuid as u\nu.uuid4()\n",
    ],
)
def test_uuid_identity_scanner_detects_random_uuid_forms(source: str) -> None:
    assert _uuid_identity_offenders(source, label="sample.py") != []


def test_issue_assignment_outbox_path_does_not_generate_random_event_identity() -> None:
    offenders: list[str] = []
    for path in IDENTITY_PATH_FILES:
        label = path.relative_to(REPO_ROOT).as_posix()
        offenders.extend(_uuid_identity_offenders(_source(path), label=label))

    assert offenders == []


def test_assign_issue_detail_uses_assignment_module_event_identity() -> None:
    source = _source(ISSUE_WORKFLOW_ROOT / "execution.py")

    assert "assignment_result = await assign_issue(" in source
    assert "assignment_result.assignment_event_id" in source
    assert "assignment_event_id=str(" not in source
    assert "assignment_event_id=str(uuid4())" not in source


def test_issue_assigned_outbox_plan_uses_persisted_assignment_event_identity() -> None:
    source = _source(ISSUE_WORKFLOW_ROOT / "outbox.py")

    assert 'idempotency_key=f"issue:{issue.id}:assigned:{assignment_event_id}"' in source
    assert "owner_user_id}:{actor_id}:{assignment_event_id}" not in source
