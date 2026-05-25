#!/usr/bin/env python3
"""CI health helpers for dependency and security manifest coverage."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import NamedTuple


REPO_ROOT = Path(__file__).resolve().parents[2]
PIP_AUDIT_ALLOWLIST = REPO_ROOT / "backend" / "security" / "pip-audit-allowlist.txt"


class DependencyAuditManifest(NamedTuple):
    path: Path
    report_name: str


_PYTHON_AUDIT_MANIFESTS = (
    DependencyAuditManifest(Path("backend/requirements.txt"), "pip-audit-report.json"),
    DependencyAuditManifest(Path("backend/requirements-runtime.txt"), "pip-audit-runtime-report.json"),
)


def python_audit_manifests() -> tuple[DependencyAuditManifest, ...]:
    """Return the backend Python dependency manifests covered by pip-audit."""
    return _PYTHON_AUDIT_MANIFESTS


def _load_pip_audit_ignore_args(allowlist_path: Path) -> list[str]:
    if not allowlist_path.is_file():
        raise FileNotFoundError(f"Missing pip-audit allowlist file: {allowlist_path}")

    args: list[str] = []
    for raw_line in allowlist_path.read_text(encoding="utf-8").splitlines():
        vuln_id = raw_line.split("#", 1)[0].strip()
        if vuln_id:
            args.extend(["--ignore-vuln", vuln_id])
    return args


def _path_for_workdir(repo_relative_path: Path, workdir: Path) -> Path:
    absolute_path = (REPO_ROOT / repo_relative_path).resolve()
    try:
        return absolute_path.relative_to(workdir)
    except ValueError:
        return absolute_path


def run_python_audit(workdir: Path) -> int:
    """Run pip-audit over every Python dependency manifest in this Module."""
    resolved_workdir = workdir.resolve()
    ignore_args = _load_pip_audit_ignore_args(PIP_AUDIT_ALLOWLIST)

    for manifest in python_audit_manifests():
        manifest_path = _path_for_workdir(manifest.path, resolved_workdir)
        report_path = resolved_workdir / manifest.report_name
        for args in (
            ["pip-audit", "-r", str(manifest_path), "--format", "json", "--output", str(report_path)],
            ["pip-audit", "-r", str(manifest_path)],
        ):
            subprocess.run([*args, *ignore_args], cwd=resolved_workdir, check=True)
    return 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="RiskHub CI health helpers.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    list_parser = subparsers.add_parser("list-python-audit-manifests")
    list_parser.add_argument(
        "--relative-to",
        default=str(REPO_ROOT),
        help="Directory to print manifest paths relative to.",
    )

    audit_parser = subparsers.add_parser("run-python-audit")
    audit_parser.add_argument(
        "--workdir",
        default=".",
        help="Working directory for pip-audit invocation and report output.",
    )

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.command == "list-python-audit-manifests":
        base = Path(args.relative_to).resolve()
        for manifest in python_audit_manifests():
            print(_path_for_workdir(manifest.path, base).as_posix())
        return 0
    if args.command == "run-python-audit":
        return run_python_audit(Path(args.workdir))
    raise AssertionError(f"Unhandled command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
