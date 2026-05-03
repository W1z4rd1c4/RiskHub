import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services._issue_register import projection

REPO_ROOT = Path(__file__).resolve().parents[5]


def test_issue_projection_import_does_not_bootstrap_issue_endpoints():
    script = """
import importlib
import sys

projection = importlib.import_module("app.services._issue_register.projection")
assert projection.serialize_issue_read_for_actor
assert "app.api.v1.endpoints.issues" not in sys.modules, sorted(
    name for name in sys.modules if name.startswith("app.api.v1.endpoints.issues")
)
"""

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=REPO_ROOT / "backend",
        env={**os.environ, "PYTHONPATH": str(REPO_ROOT / "backend")},
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr or result.stdout


@pytest.mark.asyncio
async def test_serialize_issue_summaries_for_actor_reuses_visibility_and_capabilities(monkeypatch):
    issues = [SimpleNamespace(id=1), SimpleNamespace(id=2)]
    visibility = object()
    capability_calls: list[int] = []

    async def fake_visibility(db, current_user, visible_issues):
        assert db == "db"
        assert current_user == "user"
        assert visible_issues == issues
        return visibility

    async def fake_capabilities(db, *, current_user, issue):
        assert db == "db"
        assert current_user == "user"
        capability_calls.append(issue.id)
        return {"can_edit": issue.id == 1}

    def fake_summary(issue, current_user=None, *, capabilities=None, linked_visibility=None):
        assert current_user == "user"
        assert linked_visibility is visibility
        return {
            "id": issue.id,
            "capabilities": capabilities,
        }

    monkeypatch.setattr(projection, "build_issue_linked_visibility", fake_visibility)
    monkeypatch.setattr(projection, "issue_capabilities", fake_capabilities)
    monkeypatch.setattr(projection, "_serialize_issue_summary", fake_summary)

    summaries = await projection.serialize_issue_summaries_for_actor("db", current_user="user", issues=issues)

    assert summaries == [
        {"id": 1, "capabilities": {"can_edit": True}},
        {"id": 2, "capabilities": {"can_edit": False}},
    ]
    assert capability_calls == [1, 2]
