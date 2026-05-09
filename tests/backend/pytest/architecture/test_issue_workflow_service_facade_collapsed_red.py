"""S4.1: IssueWorkflowService static-method facade must be dropped."""
from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
EXECUTION = REPO_ROOT / "backend/app/services/_issue_workflow/execution.py"
SERVICE_FACADE = REPO_ROOT / "backend/app/services/issue_workflow_service.py"
INTERNAL_SERVICE = REPO_ROOT / "backend/app/services/_issue_workflow/service.py"


def test_execution_imports_lifecycle_directly() -> None:
    text = EXECUTION.read_text()
    assert "IssueWorkflowService" not in text
    assert "from app.services._issue_workflow.assignment import" in text
    assert "from app.services._issue_workflow.remediation import" in text
    assert "from app.services._issue_workflow.exceptions import" in text
    assert "from app.services._issue_workflow.closure import" in text


def test_facade_files_deleted_or_classless() -> None:
    assert not SERVICE_FACADE.exists(), "issue_workflow_service.py facade must be deleted"
    if INTERNAL_SERVICE.exists():
        assert "class IssueWorkflowService" not in INTERNAL_SERVICE.read_text()
