"""Measured inventory declarations retain drift failures without copied count churn."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = Path("scripts/tools/structure_metrics_guard.py")
STRUCTURE = Path(".planning/codebase/STRUCTURE.md")
ARCHITECTURE = Path(".planning/codebase/ARCHITECTURE.md")
# Independent fixture facts, not read from the implementation registry.
FACTS = {
    "backend_endpoints_py_modules": (
        "backend/app/api/v1/endpoints",
        "*.py",
        "Python modules/packages",
    ),
    "backend_model_modules": ("backend/app/models", "*.py", "model modules"),
    "backend_schema_modules": ("backend/app/schemas", "*.py", "schema modules"),
    "backend_service_modules": ("backend/app/services", "*.py", "Python modules"),
    "backend_middleware_modules": ("backend/app/middleware", "*.py", "Python modules"),
    "installer_python_modules": ("scripts/install_lib", "*.py", "Python modules"),
    "tests_backend_pytest_total_files": (
        "tests/backend/pytest",
        None,
        "tracked test files",
    ),
    "tests_backend_pytest_python_files": ("tests/backend/pytest", "*.py", "Python"),
    "frontend_pages_files": ("frontend/src/pages", None, "tracked files"),
    "frontend_components_files": ("frontend/src/components", None, "tracked files"),
    "tests_frontend_e2e_specs": ("tests/frontend/e2e", "*.spec.ts", "E2E specs"),
}


def git(root, *args):
    return subprocess.run(
        ["git", *args], cwd=root, check=True, text=True, capture_output=True, timeout=20
    )


def write(root, path, text):
    target = root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


@pytest.fixture
def repo(tmp_path):
    shutil.copytree(
        ROOT / "scripts/tools",
        tmp_path / "scripts/tools",
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    lines = [
        "**Analysis Date:** 2026-01-01",
        "The `structure-metric` marker declares inventory, not budgets.",
    ]
    for key, (path, _, _) in FACTS.items():
        lines.append(
            f"- `{path}/` - source-derived inventory <!-- structure-metric: {key} -->"
        )
    lines.append("*Structure audit refreshed on 2026-01-01*")
    write(tmp_path, STRUCTURE, "\n".join(lines) + "\n")
    write(
        tmp_path,
        ARCHITECTURE,
        "**Analysis Date:** 2026-01-01\n*Architecture analysis refreshed on 2026-01-01*\n",
    )
    for path in {value[0] for value in FACTS.values()}:
        write(tmp_path, path + "/sample.py", "# tracked\n")
        write(tmp_path, path + "/notes.txt", "tracked\n")
    write(tmp_path, "tests/frontend/e2e/sample.spec.ts", "// tracked\n")
    git(tmp_path, "init", "-q")
    git(tmp_path, "add", ".")
    return tmp_path


def run(root):
    result = subprocess.run(
        [sys.executable, str(root / SCRIPT), "--output-dir", str(root / "output")],
        cwd=root,
        text=True,
        capture_output=True,
        timeout=20,
    )
    artifact = root / "output/structure-metrics-guard.json"
    return result, json.loads(artifact.read_text()) if artifact.exists() else None


def observed(payload):
    return {row["metric_id"]: row["observed"] for row in payload["metrics"]}


def assert_inventory(root):
    result, payload = run(root)
    assert result.returncode == 0, result.stdout + result.stderr
    expected = {key: 1 if pattern else 2 for key, (_, pattern, _) in FACTS.items()}
    expected["tests_frontend_e2e_specs"] = 1
    assert observed(payload) == expected
    for key, value in expected.items():
        assert f"{key}={value}" in result.stdout
    return payload


def test_source_derived_inventory_is_exact_visible_and_deterministic(repo):
    first = assert_inventory(repo)
    second = assert_inventory(repo)
    assert first["metrics"] == second["metrics"]


def test_index_changes_and_filters_are_observed_without_prose_edits(repo):
    original = (repo / STRUCTURE).read_bytes()
    write(repo, "backend/app/models/new.py", "# new\n")
    write(repo, "backend/app/models/ignored.py", "# untracked\n")
    git(repo, "add", "backend/app/models/new.py")
    (repo / "backend/app/schemas/sample.py").unlink()  # still in index
    git(repo, "rm", "--cached", "backend/app/services/sample.py")
    write(repo, "tests/frontend/e2e/other.ts", "// helper\n")
    git(repo, "add", "tests/frontend/e2e/other.ts")
    result, payload = run(repo)
    assert result.returncode == 0, result.stdout + result.stderr
    counts = observed(payload)
    assert counts["backend_model_modules"] == 2
    assert counts["backend_schema_modules"] == 1
    assert counts["backend_service_modules"] == 0
    assert counts["tests_frontend_e2e_specs"] == 1
    assert (repo / STRUCTURE).read_bytes() == original


def numeric_lines():
    lines = []
    for key, (path, pattern, label) in FACTS.items():
        if key == "tests_backend_pytest_python_files":
            continue
        if key == "tests_backend_pytest_total_files":
            lines.append(f"- `{path}/` - 2 tracked test files (1 Python)")
        else:
            lines.append(f"- `{path}/` - {1 if pattern else 2} {label}")
    return lines


@pytest.mark.parametrize("mixed", [False, True])
def test_numeric_and_mixed_compatibility_preserves_accuracy(repo, mixed):
    lines = numeric_lines()
    if mixed:
        lines[0] = (
            "- `backend/app/api/v1/endpoints/` - measured <!-- structure-metric: backend_endpoints_py_modules -->"
        )
    write(
        repo,
        STRUCTURE,
        "**Analysis Date:** 2026-01-01\n"
        + "\n".join(lines)
        + "\n*Structure audit refreshed on 2026-01-01*\n",
    )
    assert_inventory(repo)
    text = (
        (repo / STRUCTURE).read_text().replace("1 model modules", "999 model modules")
    )
    write(repo, STRUCTURE, text)
    result, payload = run(repo)
    assert result.returncode == 1
    row = next(
        row for row in payload["metrics"] if row["metric_id"] == "backend_model_modules"
    )
    assert row["status"] == "fail" and row["expected"] == 999 and row["observed"] == 1


@pytest.mark.parametrize(
    "mutation",
    [
        "missing",
        "unknown",
        "duplicate",
        "malformed",
        "conflicting_literal",
        "duplicate_numeric",
        "wrong_marker_path",
        "negative_count",
        "misspelled_unit",
    ],
)
def test_invalid_or_ambiguous_inventory_declarations_fail(repo, mutation):
    text = (repo / STRUCTURE).read_text()
    marker = "<!-- structure-metric: backend_model_modules -->"
    if mutation == "missing":
        text = text.replace(marker, "")
    elif mutation == "unknown":
        text = text.replace(marker, "<!-- structure-metric: invented -->")
    elif mutation == "duplicate":
        text += "- `backend/app/models/` " + marker + "\n"
    elif mutation == "malformed":
        text = text.replace(marker, "<!-- structure-metric backend_model_modules -->")
    elif mutation == "conflicting_literal":
        text = text.replace(
            "source-derived inventory " + marker, "999 model modules " + marker
        )
    elif mutation in {"negative_count", "misspelled_unit"}:
        text = text.replace(
            "source-derived inventory " + marker,
            (
                "-1 model modules "
                if mutation == "negative_count"
                else "999 modle modules "
            )
            + marker,
        )
    elif mutation == "wrong_marker_path":
        text = text.replace("`backend/app/models/`", "`backend/app/other/`")
    else:
        text = (
            text.replace(marker, "")
            + "\n- `backend/app/models/` - 1 model modules\n- `backend/app/models/` - 999 model modules\n"
        )
    write(repo, STRUCTURE, text)
    result, payload = run(repo)
    assert result.returncode == 1, result.stdout + result.stderr
    assert payload["summary"]["metric_fail_count"] > 0


@pytest.mark.parametrize("document", [STRUCTURE, ARCHITECTURE])
@pytest.mark.parametrize(
    "mutation",
    [
        "missing",
        "invalid",
        "mismatch",
        "future",
        "duplicate_analysis",
        "duplicate_footer",
    ],
)
def test_dates_remain_blocking(repo, document, mutation):
    text = (repo / document).read_text()
    if mutation == "missing":
        text = text.replace("**Analysis Date:** 2026-01-01", "")
    elif mutation == "invalid":
        text = text.replace("2026-01-01", "2026-02-30")
    elif mutation == "mismatch":
        text = text.replace(
            "**Analysis Date:** 2026-01-01", "**Analysis Date:** 2026-01-02"
        )
    elif mutation == "duplicate_analysis":
        text += "\n**Analysis Date:** 2026-01-01\n"
    elif mutation == "duplicate_footer":
        text += "\n" + text.splitlines()[-1] + "\n"
    else:
        text = text.replace("2026-01-01", "2999-01-01")
    write(repo, document, text)
    result, payload = run(repo)
    assert result.returncode == 1
    assert payload["summary"]["date_fail_count"] == 1


def test_git_failure_cannot_be_reported_as_zero_inventory(repo):
    shutil.rmtree(repo / ".git")
    result, _ = run(repo)
    assert result.returncode == 2
    assert "git ls-files failed" in result.stderr


@pytest.mark.parametrize("mutation", ["wrong_path", "wrong_filter", "suppressed_dates"])
def test_external_oracles_detect_tool_mutants(repo, mutation):
    script = repo / SCRIPT
    text = script.read_text()
    if mutation == "wrong_path":
        old, new = (
            'REPO_ROOT / "backend/app/models"',
            'REPO_ROOT / "backend/app/not_models"',
        )
    elif mutation == "wrong_filter":
        old, new = (
            'REPO_ROOT / "backend/app/models", "*.py"',
            'REPO_ROOT / "backend/app/models", None',
        )
    else:
        old, new = (
            'date_fail_count = sum(1 for item in date_checks if item["status"] == "fail")',
            "date_fail_count = 0",
        )
    assert old in text
    script.write_text(text.replace(old, new))
    if mutation == "suppressed_dates":
        write(
            repo,
            ARCHITECTURE,
            "**Analysis Date:** 2999-01-01\n*Architecture analysis refreshed on 2999-01-01*\n",
        )
        result, payload = run(repo)
        with pytest.raises(AssertionError):
            assert result.returncode == 1 and payload["summary"]["date_fail_count"] == 1
    else:
        with pytest.raises(AssertionError):
            assert_inventory(repo)
