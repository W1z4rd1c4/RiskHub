"""BE-N7: outbox dispatcher instruments SchedulerJobRun on entry and exit."""

from __future__ import annotations

import ast
import pathlib

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
DISPATCHER = REPO_ROOT / "backend/app/services/outbox/dispatcher.py"


def test_dispatcher_imports_scheduler_job_run() -> None:
    src = DISPATCHER.read_text()
    assert "SchedulerJobRun" in src, "dispatcher must import SchedulerJobRun"


def test_dispatcher_writes_scheduler_job_run() -> None:
    """At least one constructor call SchedulerJobRun(...) in dispatcher."""

    tree = ast.parse(DISPATCHER.read_text())
    found = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            f = node.func
            name = f.id if isinstance(f, ast.Name) else getattr(f, "attr", None)
            if name == "SchedulerJobRun":
                found = True
                break
    assert found, "dispatcher must construct SchedulerJobRun rows"
