from __future__ import annotations

from pathlib import Path
from typing import Any

from release_parity_audit.types import CommandResult


def build_run_status(
    *,
    run_id: str,
    generated_at_utc: str,
    decision: dict[str, Any],
    required_failures: int,
    artifact_root: Path,
    matrix_path: Path,
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "generated_at_utc": generated_at_utc,
        "status": "complete",
        "decision": decision.get("decision", "UNKNOWN"),
        "required_failures": required_failures,
        "artifact_root": str(artifact_root),
        "matrix": str(matrix_path),
    }


def build_report(
    *,
    run_id: str,
    decision: dict[str, Any],
    required_failures: int,
    baseline: dict[str, Any],
    findings: list[dict[str, Any]],
    artifact_root: Path,
    fingerprints_dir: Path,
    deps_dir: Path,
    ui_dir: Path,
) -> str:
    report_lines = [
        f"# Release Parity Audit ({run_id})",
        "",
        "## Result",
        f"- Decision: **{decision.get('decision', 'UNKNOWN')}**",
        f"- Required command failures: `{required_failures}`",
        f"- Baseline branch: `{baseline.get('git_branch')}`",
        f"- Baseline git SHA: `{baseline.get('git_sha')}`",
        "",
        "## Parity Matrix",
        f"- Startup inventory: `{artifact_root / 'startup-paths.json'}`",
        f"- Runtime fingerprints: `{fingerprints_dir / 'runtime.json'}`",
        f"- Toolchain fingerprint: `{fingerprints_dir / 'toolchain.json'}`",
        f"- Startup preflight: `{fingerprints_dir / 'startup-preflight.json'}`",
        f"- Launch-failure analysis: `{fingerprints_dir / 'launch-failure-analysis.json'}`",
        f"- Dependency diffs: `{deps_dir / 'diffs.json'}`",
        f"- UI parity: `{ui_dir / 'parity.json'}`",
        f"- Command matrix: `{artifact_root / 'matrix.json'}`",
        f"- Run status: `{artifact_root / 'run_status.json'}`",
        "",
        "## Findings",
    ]
    if not findings:
        report_lines.append("- No unexpected parity mismatches were detected.")
    else:
        for finding in findings:
            report_lines.append(f"- `{finding['id']}` [{finding['severity']}] {finding['summary']}")
            if finding["severity"] in {"P0", "P1"}:
                report_lines.append("  - Release impact: blocks GO.")
            elif finding["severity"] == "ENV":
                report_lines.append(
                    "  - Release impact: invalidates this host as release evidence until rerun on a clean "
                    "environment."
                )

    report_lines.extend(["", "## Remediation Queue"])
    remediation = [finding for finding in findings if finding["severity"] in {"P1", "P2", "P0"}]
    if not remediation:
        report_lines.append("- None.")
    else:
        for idx, finding in enumerate(remediation, start=1):
            report_lines.append(f"{idx}. `{finding['id']}` ({finding['severity']})")
            report_lines.extend(_remediation_lines(finding))

    report_lines.extend(
        [
            "",
            "## Evidence Map",
            "- `scripts/dev.sh:295`, `scripts/dev.sh:313`",
            "- `scripts/dev.sh:231`, `scripts/dev.sh:233`",
            "- `backend/requirements.txt:1`, `backend/requirements-runtime.txt:1`, `backend/requirements-db.txt:1`",
            "- `backend/Dockerfile:7`, `backend/Dockerfile:25`",
            "- `frontend/Dockerfile:7`, `frontend/Dockerfile:16`",
            "- `.github/workflows/e2e.yml:39`, `.github/workflows/e2e.yml:45`, `.github/workflows/e2e.yml:55`",
            "- `backend/app/api/v1/endpoints/auth/config.py:13`, `frontend/src/pages/LoginPage.tsx:327`",
            "- `backend/app/core/config.py:15`, `backend/app/api/v1/endpoints/health.py:61`",
            (
                "- `scripts/security/run_prod_readiness_audit_local.sh:246`, "
                "`docs/security/reports/prod-readiness-deep-audit-2026-02-22.md:17`"
            ),
        ]
    )

    return "\n".join(report_lines) + "\n"


def matrix_payload(command_results: list[CommandResult]) -> list[dict[str, Any]]:
    return [entry.to_json() for entry in command_results]


def _remediation_lines(finding: dict[str, Any]) -> list[str]:
    if finding["id"] == "P2-dev-frontend-nonreproducible-install":
        return [
            (
                "   - Fix: switch `scripts/dev.sh` frontend bootstrap from `npm install` to `npm ci` when "
                "lockfile is present."
            ),
            "   - Guard: add a script-contract test asserting lockfile-respecting install path.",
        ]
    if finding["id"] == "P2-node-major-mismatch":
        expected_major = finding.get("expected_node_major")
        if expected_major is None:
            fix = (
                "   - Fix: align host Node to CI/Docker baseline major from workflow config for release-critical "
                "validation runs."
            )
        else:
            fix = (
                "   - Fix: align host Node to CI/Docker baseline major "
                f"({expected_major}) for release-critical validation runs."
            )
        return [
            fix,
            "   - Guard: enforce `.nvmrc`/`.node-version` + preflight version check in startup scripts.",
        ]
    if finding["id"] == "P1-ui-parity-mismatch":
        return [
            "   - Fix: align auth/profile inputs and frontend build/runtime mode before comparing screenshots.",
            "   - Guard: add a deterministic UI parity smoke scenario with fixed auth mode and seed data.",
        ]
    if str(finding["id"]).startswith("P1-startup-path-failed-"):
        return [
            "   - Fix: repair startup path command and ensure it reaches healthy backend/frontend state.",
            "   - Guard: add script-level smoke checks for each startup entrypoint before release cut.",
        ]
    if finding["severity"] == "ENV":
        return [
            (
                "   - Fix: clean the host environment or provide the missing prerequisite, then rerun parity on a "
                "valid evidence host."
            ),
            (
                "   - Guard: preserve the startup preflight gate and launch-failure classification to prevent false "
                "product blockers."
            ),
        ]
    if finding["severity"] == "P1":
        return [
            "   - Fix: pin backend runtime dependencies for release reproducibility and rebuild release image.",
            "   - Guard: add backend dependency parity gate comparing local lock set vs image lock set.",
        ]
    if finding["severity"] == "P0":
        return [
            "   - Fix: ensure runtime and artifact baselines resolve to selected release commit.",
            "   - Guard: embed and verify git SHA in runtime health metadata.",
        ]
    return ["   - Fix: resolve mismatch and rerun parity audit."]
