#!/usr/bin/env python3
"""Measure declared Git-index inventory; validate literal claims and topology dates."""

from __future__ import annotations

import argparse
import fnmatch
import json
import re
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
STRUCTURE_PATH = REPO_ROOT / ".planning" / "codebase" / "STRUCTURE.md"
ARCHITECTURE_PATH = REPO_ROOT / ".planning" / "codebase" / "ARCHITECTURE.md"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report declared Git-index counts, reject stale literal claims, and guard topology dates."
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Optional output directory. Defaults to tests/results/docs/structure-metrics-guard-<timestamp>.",
    )
    return parser.parse_args()


def utc_now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def run_id_now() -> str:
    return datetime.now(timezone.utc).strftime("structure-metrics-guard-%Y%m%d-%H%M%S")


def resolve_output_dir(arg_output_dir: str, run_id: str) -> Path:
    if arg_output_dir:
        return Path(arg_output_dir).resolve()
    return REPO_ROOT / "tests" / "results" / "docs" / run_id


def _git_ls_files(path: Path) -> list[str]:
    try:
        rel_path = path.relative_to(REPO_ROOT).as_posix()
    except ValueError as exc:
        raise RuntimeError(f"Path is outside repository root: {path}") from exc

    try:
        result = subprocess.run(
            ["git", "ls-files", "--", rel_path],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
    except Exception as exc:  # pragma: no cover - defensive runtime path
        raise RuntimeError(f"Failed to run git ls-files for {rel_path}: {exc}") from exc

    if result.returncode != 0:
        stderr = result.stderr.strip() or "<no stderr>"
        raise RuntimeError(f"git ls-files failed for {rel_path}: {stderr}")

    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def count_tracked_files(path: Path, pattern: str | None = None) -> int:
    tracked_files = _git_ls_files(path)
    if pattern is None:
        return len(tracked_files)
    return sum(1 for rel in tracked_files if fnmatch.fnmatch(Path(rel).name, pattern))


# Reviewed inventory identifiers, not minimums, budgets, or generated ratchets.
# Literal claims remain supported and must equal the observed Git index count.
METRIC_DECLARATIONS = {
    "backend_endpoints_py_modules": (
        "backend/app/api/v1/endpoints/",
        r"(\d+)\s+Python modules/packages",
    ),
    "backend_model_modules": ("backend/app/models/", r"(\d+)\s+model modules"),
    "backend_schema_modules": ("backend/app/schemas/", r"(\d+)\s+schema modules"),
    "backend_service_modules": ("backend/app/services/", r"(\d+)\s+Python modules"),
    "backend_middleware_modules": (
        "backend/app/middleware/",
        r"(\d+)\s+Python modules",
    ),
    "installer_python_modules": ("scripts/install_lib/", r"(\d+)\s+Python modules"),
    "tests_backend_pytest_total_files": (
        "tests/backend/pytest/",
        r"(\d+)\s+(?:tracked\s+)?test files\s+\(\d+\s+Python\)",
    ),
    "tests_backend_pytest_python_files": (
        "tests/backend/pytest/",
        r"\d+\s+(?:tracked\s+)?test files\s+\((\d+)\s+Python\)",
    ),
    "frontend_pages_files": ("frontend/src/pages/", r"(\d+)\s+(?:tracked\s+)?files"),
    "frontend_components_files": (
        "frontend/src/components/",
        r"(\d+)\s+(?:tracked\s+)?files",
    ),
    "tests_frontend_e2e_specs": ("tests/frontend/e2e/", r"(\d+)\s+E2E specs"),
}
MARKER = re.compile(r"<!-- structure-metric: ([a-z][a-z0-9_]*) -->")


def build_metric_expectations(
    structure_lines: list[str],
) -> tuple[dict[str, dict[str, object]], list[str]]:
    declarations: dict[str, list[dict[str, object]]] = {
        key: [] for key in METRIC_DECLARATIONS
    }
    failures: list[str] = []
    for line_no, line in enumerate(structure_lines, start=1):
        pointer = f".planning/codebase/STRUCTURE.md:{line_no}"
        markers = list(MARKER.finditer(line))
        if len(re.findall(r"<!--\s*structure-metric", line)) != len(markers):
            failures.append(f"{pointer}: malformed_metric_marker")
        for marker in markers:
            metric_id = marker.group(1)
            if metric_id not in METRIC_DECLARATIONS:
                failures.append(f"{pointer}: unknown_metric:{metric_id}")
                continue
            path, _ = METRIC_DECLARATIONS[metric_id]
            if f"`{path}`" not in line:
                failures.append(f"{pointer}: metric_path_mismatch:{metric_id}")
            declarations[metric_id].append(
                {"expected": None, "source_pointer": pointer, "mode": "source_derived"}
            )
        for metric_id, (path, literal) in METRIC_DECLARATIONS.items():
            pattern = re.compile(re.escape(f"`{path}`") + r"\s*-\s*" + literal)
            count_like = re.search(re.escape(f"`{path}`") + r"\s*-\s*[+-]?\d", line)
            if count_like and not pattern.search(line):
                failures.append(f"{pointer}: malformed_numeric_claim:{metric_id}")
            for match in pattern.finditer(line):
                declarations[metric_id].append(
                    {
                        "expected": int(match.group(1)),
                        "source_pointer": pointer,
                        "mode": "numeric_claim",
                    }
                )
    expectations: dict[str, dict[str, object]] = {}
    for metric_id, entries in declarations.items():
        if len(entries) == 1:
            expectations[metric_id] = {**entries[0], "declaration_valid": True}
        else:
            failures.append(
                f"{metric_id}: {'missing' if not entries else 'duplicate_or_conflicting'}_metric_declaration"
            )
            expectations[metric_id] = {
                "expected": None,
                "source_pointer": [entry["source_pointer"] for entry in entries],
                "mode": "invalid",
                "declaration_valid": False,
            }
    return expectations, failures


def build_metric_observed() -> dict[str, int]:
    return {
        "backend_endpoints_py_modules": count_tracked_files(
            REPO_ROOT / "backend/app/api/v1/endpoints", "*.py"
        ),
        "backend_model_modules": count_tracked_files(
            REPO_ROOT / "backend/app/models", "*.py"
        ),
        "backend_schema_modules": count_tracked_files(
            REPO_ROOT / "backend/app/schemas", "*.py"
        ),
        "backend_service_modules": count_tracked_files(
            REPO_ROOT / "backend/app/services", "*.py"
        ),
        "backend_middleware_modules": count_tracked_files(
            REPO_ROOT / "backend/app/middleware", "*.py"
        ),
        "installer_python_modules": count_tracked_files(
            REPO_ROOT / "scripts/install_lib", "*.py"
        ),
        "tests_backend_pytest_total_files": count_tracked_files(
            REPO_ROOT / "tests/backend/pytest"
        ),
        "tests_backend_pytest_python_files": count_tracked_files(
            REPO_ROOT / "tests/backend/pytest", "*.py"
        ),
        "frontend_pages_files": count_tracked_files(REPO_ROOT / "frontend/src/pages"),
        "frontend_components_files": count_tracked_files(
            REPO_ROOT / "frontend/src/components"
        ),
        "tests_frontend_e2e_specs": count_tracked_files(
            REPO_ROOT / "tests/frontend/e2e", "*.spec.ts"
        ),
    }


def parse_date_or_none(raw_value: str) -> date | None:
    if not raw_value:
        return None
    try:
        return date.fromisoformat(raw_value)
    except ValueError:
        return None


def extract_marked_date(
    lines: list[str], regex: re.Pattern[str]
) -> tuple[str | None, str | None]:
    matches = [
        (number, regex.fullmatch(line.strip()))
        for number, line in enumerate(lines, start=1)
    ]
    found = [(number, match) for number, match in matches if match is not None]
    if len(found) != 1:
        return None, None
    number, match = found[0]
    return match.group(1), str(number)


def evaluate_date_check(
    file_rel_path: str, analysis_regex: re.Pattern[str], footer_regex: re.Pattern[str]
) -> dict[str, object]:
    file_path = REPO_ROOT / file_rel_path
    lines = file_path.read_text(encoding="utf-8").splitlines()

    analysis_raw, analysis_line = extract_marked_date(lines, analysis_regex)
    footer_raw, footer_line = extract_marked_date(lines, footer_regex)
    analysis_date = parse_date_or_none(analysis_raw or "")
    footer_date = parse_date_or_none(footer_raw or "")
    today_utc = datetime.now(timezone.utc).date()

    failures: list[str] = []
    if sum(line.strip().startswith("**Analysis Date:") for line in lines) != 1:
        failures.append("missing_or_duplicate_analysis_declaration")
    footer_prefix = (
        "*Structure audit refreshed on"
        if file_rel_path == ".planning/codebase/STRUCTURE.md"
        else "*Architecture analysis refreshed on"
    )
    if sum(line.strip().startswith(footer_prefix) for line in lines) != 1:
        failures.append("missing_or_duplicate_footer_declaration")
    if analysis_date is None:
        failures.append("missing_or_invalid_analysis_date")
    if footer_date is None:
        failures.append("missing_or_invalid_footer_date")
    if (
        analysis_date is not None
        and footer_date is not None
        and analysis_date != footer_date
    ):
        failures.append("analysis_footer_mismatch")
    if analysis_date is not None and analysis_date > today_utc:
        failures.append("analysis_date_in_future")
    if footer_date is not None and footer_date > today_utc:
        failures.append("footer_date_in_future")

    return {
        "file": file_rel_path,
        "analysis_date": analysis_raw,
        "footer_date": footer_raw,
        "status": "pass" if not failures else "fail",
        "failures": failures,
        "source_pointers": {
            "analysis_line": f"{file_rel_path}:{analysis_line}"
            if analysis_line
            else f"{file_rel_path}:not_found",
            "footer_line": f"{file_rel_path}:{footer_line}"
            if footer_line
            else f"{file_rel_path}:not_found",
        },
    }


def run_guard(run_id: str) -> tuple[dict[str, object], int]:
    structure_lines = STRUCTURE_PATH.read_text(encoding="utf-8").splitlines()
    metric_expectations, declaration_failures = build_metric_expectations(
        structure_lines
    )
    metric_observed = build_metric_observed()

    metrics: list[dict[str, object]] = []
    metric_fail_count = len(declaration_failures)
    for metric_id, expected_meta in metric_expectations.items():
        expected_value = expected_meta["expected"]
        observed_value = metric_observed[metric_id]
        if not expected_meta["declaration_valid"]:
            status = "fail"
        elif expected_meta["mode"] == "source_derived":
            status = "pass"
        else:
            status = "pass" if expected_value == observed_value else "fail"
        if status == "fail":
            metric_fail_count += 1
        metrics.append(
            {
                "metric_id": metric_id,
                "expected": expected_value,
                "observed": observed_value,
                "status": status,
                "source_pointer": expected_meta["source_pointer"],
                "mode": expected_meta["mode"],
            }
        )

    date_checks = [
        evaluate_date_check(
            ".planning/codebase/STRUCTURE.md",
            re.compile(r"\*\*Analysis Date:\*\*\s*(\d{4}-\d{2}-\d{2})"),
            re.compile(r"\*Structure audit refreshed on (\d{4}-\d{2}-\d{2})\*"),
        ),
        evaluate_date_check(
            ".planning/codebase/ARCHITECTURE.md",
            re.compile(r"\*\*Analysis Date:\*\*\s*(\d{4}-\d{2}-\d{2})"),
            re.compile(r"\*Architecture analysis refreshed on (\d{4}-\d{2}-\d{2})\*"),
        ),
    ]
    date_fail_count = sum(1 for item in date_checks if item["status"] == "fail")

    has_failures = metric_fail_count > 0 or date_fail_count > 0
    payload: dict[str, object] = {
        "run_id": run_id,
        "generated_at_utc": utc_now_iso(),
        "repo_root": str(REPO_ROOT),
        "counting_mode": "git_tracked_files",
        "status": "fail" if has_failures else "pass",
        "summary": {
            "metrics_checked": len(metrics),
            "metric_fail_count": metric_fail_count,
            "date_checks_count": len(date_checks),
            "date_fail_count": date_fail_count,
        },
        "metrics": metrics,
        "declaration_failures": declaration_failures,
        "date_checks": date_checks,
    }
    return payload, (1 if has_failures else 0)


def main() -> int:
    args = parse_args()
    try:
        run_id = run_id_now()
        payload, exit_code = run_guard(run_id)
        output_dir = resolve_output_dir(args.output_dir, run_id)
        output_dir.mkdir(parents=True, exist_ok=True)
        json_path = output_dir / "structure-metrics-guard.json"
        json_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
        )

        for metric in payload["metrics"]:
            print(f"{metric['metric_id']}={metric['observed']}")
        print(f"structure_metrics_guard_status={payload['status']}")
        print(f"structure_metrics_guard_json={json_path}")
        return exit_code
    except Exception as exc:  # pragma: no cover - defensive runtime path
        print(f"ERROR: structure metrics guard runtime failure: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
