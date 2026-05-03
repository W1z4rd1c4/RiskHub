from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any


def evaluate_findings_and_decision(
    *,
    run_id: str,
    baseline: dict[str, Any],
    runtime_fingerprints: list[dict[str, Any]],
    static_resolution: dict[str, Any],
    toolchain_fingerprint: dict[str, Any],
    dep_diffs: dict[str, Any],
    ui_parity: dict[str, Any],
    required_failures: int,
    artifact_root: Path,
    deps_dir: Path,
    fingerprints_dir: Path,
    ui_dir: Path,
    iso_now: Callable[[], str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    findings: list[dict[str, Any]] = []

    baseline_sha = baseline.get("git_sha")
    for fp in runtime_fingerprints:
        observed = fp.get("git_sha_observed")
        context_id = fp.get("context_id")
        if observed is not None and baseline_sha is not None and observed != baseline_sha:
            findings.append(
                {
                    "id": f"P0-git-sha-mismatch-{context_id}",
                    "severity": "P0",
                    "classification": "unexpected",
                    "summary": "Runtime git SHA differs from selected baseline main HEAD.",
                    "context_id": context_id,
                    "expected": baseline_sha,
                    "observed": observed,
                }
            )

    for fp in runtime_fingerprints:
        if not fp.get("launch_failed"):
            continue
        startup_path_id = fp.get("startup_path_id", "unknown")
        failure = fp.get("launch_failure", {})
        if failure.get("classification") == "environment_contamination":
            findings.append(
                {
                    "id": f"ENV-startup-path-{startup_path_id}-{failure.get('code', 'unknown')}",
                    "severity": "ENV",
                    "classification": "environment_contamination",
                    "summary": failure.get(
                        "summary",
                        "The audit host was not valid evidence for this startup path.",
                    ),
                    "startup_path_id": startup_path_id,
                    "context_id": fp.get("context_id"),
                    "launch_rc": fp.get("launch_rc"),
                    "launch_log": fp.get("launch_log"),
                }
            )
        else:
            findings.append(
                {
                    "id": f"P1-startup-path-failed-{startup_path_id}",
                    "severity": "P1",
                    "classification": "unexpected",
                    "summary": failure.get(
                        "summary",
                        "Startup command failed for this path before parity fingerprints could be captured.",
                    ),
                    "startup_path_id": startup_path_id,
                    "context_id": fp.get("context_id"),
                    "launch_rc": fp.get("launch_rc"),
                    "launch_log": fp.get("launch_log"),
                }
            )

    for diff in dep_diffs.get("backend_drift", []):
        findings.append(
            {
                "id": f"P1-backend-dep-drift-{diff['package']}",
                "severity": "P1",
                "classification": "unexpected",
                "summary": "Critical backend dependency differs between local venv and backend image.",
                "package": diff["package"],
                "local": diff["local"],
                "image": diff["image"],
                "evidence": [str(deps_dir / "backend-local.txt"), str(deps_dir / "backend-image.txt")],
            }
        )

    if ui_parity.get("mismatches_same_auth_mode_same_commit"):
        findings.append(
            {
                "id": "P1-ui-parity-mismatch",
                "severity": "P1",
                "classification": "unexpected",
                "summary": "UI screenshots differ across contexts with same auth mode, app version, and git SHA.",
                "groups": ui_parity.get("mismatches_same_auth_mode_same_commit"),
                "evidence": [str(ui_dir / "parity.json")],
            }
        )

    expected_node_major = None
    node_versions = static_resolution.get("ci_runtime_policy", {}).get("node_versions", [])
    if node_versions:
        expected_node_major = int(str(node_versions[0]).split(".")[0])

    effective_node = toolchain_fingerprint.get("dev_sh_effective_node", {})
    effective_node_major = effective_node.get("major")
    if expected_node_major and effective_node_major and effective_node_major != expected_node_major:
        findings.append(
            {
                "id": "P2-node-major-mismatch",
                "severity": "P2",
                "classification": "unexpected",
                "summary": "Effective Node runtime for scripts/dev.sh differs from the CI/Docker baseline.",
                "expected_node_major": expected_node_major,
                "observed_node_major": effective_node_major,
                "evidence": [
                    str(fingerprints_dir / "toolchain.json"),
                    str(artifact_root / "static-resolution.json"),
                ],
            }
        )
    elif expected_node_major and not effective_node.get("selected"):
        findings.append(
            {
                "id": "ENV-dev-sh-node-runtime-unavailable",
                "severity": "ENV",
                "classification": "environment_contamination",
                "summary": (
                    "scripts/dev.sh could not resolve a Node runtime matching the CI/Docker baseline on this host."
                ),
                "expected_node_major": expected_node_major,
                "observed_node_major": effective_node_major,
                "evidence": [
                    str(fingerprints_dir / "toolchain.json"),
                    str(fingerprints_dir / "startup-preflight.json"),
                ],
            }
        )

    dev_startup = static_resolution.get("dev_startup", {})
    if dev_startup.get("frontend_has_npm_install_fallback") and not dev_startup.get(
        "frontend_prefers_npm_ci_with_lockfile"
    ):
        findings.append(
            {
                "id": "P2-dev-frontend-nonreproducible-install",
                "severity": "P2",
                "classification": "unexpected",
                "summary": "scripts/dev.sh uses npm install (not npm ci), which is non-lockfile-reproducible.",
                "evidence": ["scripts/dev.sh:231", "scripts/dev.sh:233"],
            }
        )

    for diff in dep_diffs.get("frontend_drift", []):
        findings.append(
            {
                "id": f"P2-frontend-lock-drift-{diff['package']}",
                "severity": "P2",
                "classification": "unexpected",
                "summary": "Installed frontend dependency differs from lockfile resolution.",
                "package": diff["package"],
                "installed": diff["installed"],
                "lock": diff["lock"],
                "evidence": [
                    str(deps_dir / "frontend-installed.json"),
                    str(deps_dir / "frontend-lock.json"),
                ],
            }
        )

    env_only_launch_failures = any(item["classification"] == "environment_contamination" for item in findings)
    product_launch_failures = any(str(item["id"]).startswith("P1-startup-path-failed-") for item in findings)
    if required_failures > 0 and not product_launch_failures:
        findings.append(
            {
                "id": "ENV-required-command-failures" if env_only_launch_failures else "P1-required-command-failures",
                "severity": "ENV" if env_only_launch_failures else "P1",
                "classification": "environment_contamination" if env_only_launch_failures else "unexpected",
                "summary": (
                    "One or more required audit commands failed because the host environment was not valid "
                    "release evidence."
                    if env_only_launch_failures
                    else "One or more required audit commands failed."
                ),
                "required_failures": required_failures,
                "evidence": [str(artifact_root / "matrix.json")],
            }
        )

    has_p0_p1 = any(item["severity"] in {"P0", "P1"} for item in findings)
    has_p2 = any(item["severity"] == "P2" for item in findings)
    has_environment_contamination = any(item["classification"] == "environment_contamination" for item in findings)

    if has_p0_p1:
        release_decision = "NO-GO"
    elif has_environment_contamination:
        release_decision = "INVALID_ENVIRONMENT"
    elif has_p2:
        release_decision = "CONDITIONAL"
    else:
        release_decision = "GO"

    decision = {
        "run_id": run_id,
        "generated_at_utc": iso_now(),
        "decision": release_decision,
        "required_failures": required_failures,
        "finding_counts": {
            "P0": sum(1 for item in findings if item["severity"] == "P0"),
            "P1": sum(1 for item in findings if item["severity"] == "P1"),
            "P2": sum(1 for item in findings if item["severity"] == "P2"),
            "ENV": sum(1 for item in findings if item["severity"] == "ENV"),
        },
        "go_criteria": "No unresolved P0/P1 findings",
    }
    return findings, decision
