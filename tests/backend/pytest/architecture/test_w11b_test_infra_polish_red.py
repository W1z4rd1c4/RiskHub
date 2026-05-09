from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_TEST_ROOT = REPO_ROOT / "tests/backend/pytest"
ARCHITECTURE_TEST_ROOT = BACKEND_TEST_ROOT / "architecture"

ALLOWED_SUBPROCESS_IMPORTABILITY_CHECKS = {
    "tests/backend/pytest/api/v1/test_issue_register_projection.py",
    "tests/backend/pytest/test_install_script_contracts.py",
}

DEAD_KRI_HISTORY_FACADES = {
    "backend/app/api/v1/endpoints/kris/history_corrections.py",
    "backend/app/api/v1/endpoints/kris/history_helpers.py",
    "backend/app/api/v1/endpoints/kris/history_listing.py",
    "backend/app/api/v1/endpoints/kris/history_loading.py",
    "backend/app/api/v1/endpoints/kris/history_submission.py",
    "backend/app/api/v1/endpoints/kris/history_value_application.py",
}


def _source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_architecture_tests_are_marked_contract() -> None:
    architecture_tests = sorted(ARCHITECTURE_TEST_ROOT.glob("test_*.py")) + [
        BACKEND_TEST_ROOT / "test_architecture_deepening_contracts.py"
    ]

    unmarked = []
    for path in architecture_tests:
        source = _source(path)
        if "pytestmark = pytest.mark.contract" not in source:
            unmarked.append(str(path.relative_to(REPO_ROOT)))

    assert unmarked == []


def test_no_unapproved_subprocess_importability_checks_remain() -> None:
    offenders = []
    for path in sorted(BACKEND_TEST_ROOT.rglob("test_*.py")):
        relative_path = str(path.relative_to(REPO_ROOT))
        if relative_path in ALLOWED_SUBPROCESS_IMPORTABILITY_CHECKS:
            continue
        source = _source(path)
        if "subprocess.run(" not in source:
            continue
        if 'sys.executable,\n' in source and '"-c"' in source:
            offenders.append(relative_path)
        elif "[sys.executable, \"-c\"" in source:
            offenders.append(relative_path)

    assert offenders == []


def test_dead_kri_history_endpoint_facades_are_removed() -> None:
    existing = sorted(path for path in DEAD_KRI_HISTORY_FACADES if (REPO_ROOT / path).exists())

    assert existing == []
