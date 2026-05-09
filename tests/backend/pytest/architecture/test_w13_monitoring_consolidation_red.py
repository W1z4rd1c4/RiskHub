from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
RESPONSE_FILE = REPO_ROOT / "backend/app/services/_monitoring_response.py"
STATUS_README = REPO_ROOT / "backend/app/services/_monitoring_status/README.md"
PACKAGE_INIT = REPO_ROOT / "backend/app/services/_monitoring_response/__init__.py"


def test_monitoring_response_docstring_mentions_monitoring_status() -> None:
    text = RESPONSE_FILE.read_text(encoding="utf-8")
    assert "monitoring_status" in text[:600], "docstring must reference _monitoring_status"


def test_monitoring_status_readme_mentions_monitoring_response() -> None:
    text = STATUS_README.read_text(encoding="utf-8")
    assert "_monitoring_response.py" in text


def test_monitoring_response_remains_single_file() -> None:
    assert not PACKAGE_INIT.exists(), "S2.10: _monitoring_response must remain a single file, not a package"
