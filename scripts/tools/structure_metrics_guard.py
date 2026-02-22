#!/usr/bin/env python3
"""Validate repository-structure metric claims and topology document date coherence."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
STRUCTURE_PATH = REPO_ROOT / ".planning" / "codebase" / "STRUCTURE.md"
ARCHITECTURE_PATH = REPO_ROOT / ".planning" / "codebase" / "ARCHITECTURE.md"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Guard STRUCTURE.md count claims and STRUCTURE/ARCHITECTURE date coherence."
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Optional output directory. Defaults to tests/results/docs/structure-metrics-guard-<timestamp>.",
    )
    return parser.parse_args()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def run_id_now() -> str:
    return datetime.now(timezone.utc).strftime("structure-metrics-guard-%Y%m%d-%H%M%S")


def resolve_output_dir(arg_output_dir: str, run_id: str) -> Path:
    if arg_output_dir:
        return Path(arg_output_dir).resolve()
    return REPO_ROOT / "tests" / "results" / "docs" / run_id


def count_files(path: Path, pattern: str | None = None) -> int:
    if pattern is None:
        return sum(1 for candidate in path.rglob("*") if candidate.is_file())
    return sum(1 for candidate in path.rglob(pattern) if candidate.is_file())


def line_number_and_value(lines: list[str], pattern: re.Pattern[str]) -> tuple[int, re.Match[str]] | None:
    for idx, line in enumerate(lines, start=1):
        match = pattern.search(line)
        if match:
            return idx, match
    return None


def build_metric_expectations(structure_lines: list[str]) -> dict[str, dict[str, object]]:
    expectations: dict[str, dict[str, object]] = {}

    single_patterns: list[tuple[str, re.Pattern[str]]] = [
        (
            "backend_endpoints_py_modules",
            re.compile(r"`backend/app/api/v1/endpoints/`\s*-\s*(\d+)\s+Python modules/packages"),
        ),
        ("backend_model_modules", re.compile(r"`backend/app/models/`\s*-\s*(\d+)\s+model modules")),
        ("backend_schema_modules", re.compile(r"`backend/app/schemas/`\s*-\s*(\d+)\s+schema modules")),
        ("backend_service_modules", re.compile(r"`backend/app/services/`\s*-\s*(\d+)\s+Python modules")),
        ("frontend_pages_files", re.compile(r"`frontend/src/pages/`\s*-\s*(\d+)\s+files")),
        ("frontend_components_files", re.compile(r"`frontend/src/components/`\s*-\s*(\d+)\s+files")),
        ("tests_frontend_e2e_specs", re.compile(r"`tests/frontend/e2e/`\s*-\s*(\d+)\s+E2E specs")),
    ]

    for metric_id, pattern in single_patterns:
        located = line_number_and_value(structure_lines, pattern)
        if not located:
            expectations[metric_id] = {
                "expected": None,
                "source_pointer": ".planning/codebase/STRUCTURE.md:not_found",
            }
            continue
        line_no, match = located
        expectations[metric_id] = {
            "expected": int(match.group(1)),
            "source_pointer": f".planning/codebase/STRUCTURE.md:{line_no}",
        }

    backend_test_pattern = re.compile(
        r"`tests/backend/pytest/`\s*-\s*(\d+)\s+test files\s+\((\d+)\s+Python\)"
    )
    located_backend_tests = line_number_and_value(structure_lines, backend_test_pattern)
    if not located_backend_tests:
        expectations["tests_backend_pytest_total_files"] = {
            "expected": None,
            "source_pointer": ".planning/codebase/STRUCTURE.md:not_found",
        }
        expectations["tests_backend_pytest_python_files"] = {
            "expected": None,
            "source_pointer": ".planning/codebase/STRUCTURE.md:not_found",
        }
    else:
        line_no, match = located_backend_tests
        expectations["tests_backend_pytest_total_files"] = {
            "expected": int(match.group(1)),
            "source_pointer": f".planning/codebase/STRUCTURE.md:{line_no}",
        }
        expectations["tests_backend_pytest_python_files"] = {
            "expected": int(match.group(2)),
            "source_pointer": f".planning/codebase/STRUCTURE.md:{line_no}",
        }

    return expectations


def build_metric_observed() -> dict[str, int]:
    return {
        "backend_endpoints_py_modules": count_files(REPO_ROOT / "backend/app/api/v1/endpoints", "*.py"),
        "backend_model_modules": count_files(REPO_ROOT / "backend/app/models", "*.py"),
        "backend_schema_modules": count_files(REPO_ROOT / "backend/app/schemas", "*.py"),
        "backend_service_modules": count_files(REPO_ROOT / "backend/app/services", "*.py"),
        "tests_backend_pytest_total_files": count_files(REPO_ROOT / "tests/backend/pytest"),
        "tests_backend_pytest_python_files": count_files(REPO_ROOT / "tests/backend/pytest", "*.py"),
        "frontend_pages_files": count_files(REPO_ROOT / "frontend/src/pages"),
        "frontend_components_files": count_files(REPO_ROOT / "frontend/src/components"),
        "tests_frontend_e2e_specs": count_files(REPO_ROOT / "tests/frontend/e2e", "*.spec.ts"),
    }


def parse_date_or_none(raw_value: str) -> date | None:
    if not raw_value:
        return None
    try:
        return date.fromisoformat(raw_value)
    except ValueError:
        return None


def extract_marked_date(lines: list[str], regex: re.Pattern[str]) -> tuple[str | None, str | None]:
    located = line_number_and_value(lines, regex)
    if not located:
        return None, None
    line_no, match = located
    return match.group(1), str(line_no)


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
    if analysis_date is None:
        failures.append("missing_or_invalid_analysis_date")
    if footer_date is None:
        failures.append("missing_or_invalid_footer_date")
    if analysis_date is not None and footer_date is not None and analysis_date != footer_date:
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
            "analysis_line": f"{file_rel_path}:{analysis_line}" if analysis_line else f"{file_rel_path}:not_found",
            "footer_line": f"{file_rel_path}:{footer_line}" if footer_line else f"{file_rel_path}:not_found",
        },
    }


def run_guard(run_id: str) -> tuple[dict[str, object], int]:
    structure_lines = STRUCTURE_PATH.read_text(encoding="utf-8").splitlines()
    metric_expectations = build_metric_expectations(structure_lines)
    metric_observed = build_metric_observed()

    metrics: list[dict[str, object]] = []
    metric_fail_count = 0
    for metric_id, expected_meta in metric_expectations.items():
        expected_value = expected_meta["expected"]
        observed_value = metric_observed[metric_id]
        if expected_value is None:
            status = "fail"
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
        "status": "fail" if has_failures else "pass",
        "summary": {
            "metrics_checked": len(metrics),
            "metric_fail_count": metric_fail_count,
            "date_checks_count": len(date_checks),
            "date_fail_count": date_fail_count,
        },
        "metrics": metrics,
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
        json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

        print(f"structure_metrics_guard_status={payload['status']}")
        print(f"structure_metrics_guard_json={json_path}")
        return exit_code
    except Exception as exc:  # pragma: no cover - defensive runtime path
        print(f"ERROR: structure metrics guard runtime failure: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
