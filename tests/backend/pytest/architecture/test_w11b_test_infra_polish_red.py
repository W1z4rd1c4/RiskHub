from __future__ import annotations

import re
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

ALLOWED_FILE_WIDE_MIXED_TOKEN_FALSE_POSITIVES = {
    "tests/backend/pytest/test_phase500_script_runtime_contracts.py",
}

EXPLICIT_PYTHON_C_ARGS = re.compile(
    r'''\[\s*sys\.executable\s*,\s*["']-c["']'''
)

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
        if EXPLICIT_PYTHON_C_ARGS.search(source) or (
            relative_path not in ALLOWED_FILE_WIDE_MIXED_TOKEN_FALSE_POSITIVES
            and 'sys.executable,\n' in source
            and '"-c"' in source
        ):
            offenders.append(relative_path)

    assert offenders == []


@pytest.mark.parametrize(
    ("source", "detected"),
    [
        ("[" + 'sys.executable, "-c", "import package"]', True),
        ("[\n" + '    sys.executable,\n    "-c",\n    "import package",\n]', True),
        ('["bash", "-c", "run-harness"]', False),
    ],
)
def test_explicit_python_c_detector_is_call_local(source: str, detected: bool) -> None:
    assert bool(EXPLICIT_PYTHON_C_ARGS.search(source)) is detected


def test_dead_kri_history_endpoint_facades_are_removed() -> None:
    existing = sorted(path for path in DEAD_KRI_HISTORY_FACADES if (REPO_ROOT / path).exists())

    assert existing == []
