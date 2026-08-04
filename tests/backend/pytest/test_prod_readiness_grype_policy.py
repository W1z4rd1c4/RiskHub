from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SECURITY_SCRIPTS_DIR = REPO_ROOT / "scripts" / "security"
GRYPE_IGNORE = REPO_ROOT / "backend" / "security" / "grype-ignore.yaml"
if str(SECURITY_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SECURITY_SCRIPTS_DIR))


def _policy(*, expires_on: str = "2026-09-30") -> str:
    return (
        "ignore:\n"
        "  - vulnerability: CVE-2026-15308\n"
        '    reason: "Owner: Platform. Decision: temporary acceptance. '
        "Scanner evidence: Grype reports the exact affected package. "
        "No-fix proof: upstream has not released a fixed version. "
        'Reachability: vulnerable path is not used. Exit: upgrade the runtime."\n'
        f"    expires-on: {expires_on}\n"
        "    package:\n"
        "      name: python\n"
        "      version: 3.13.14\n"
        "      type: binary\n"
        "      location: /usr/local/bin/python3.13\n"
    )


def test_expired_grype_suppression_fails_closed(tmp_path: Path) -> None:
    from prod_readiness_audit.grype_policy import (
        GrypePolicyError,
        validate_grype_policy,
    )

    policy = tmp_path / "grype-ignore.yaml"
    policy.write_text(_policy(), encoding="utf-8")

    with pytest.raises(GrypePolicyError, match="expired on 2026-09-30"):
        validate_grype_policy(policy, today=date(2026, 10, 1))


@pytest.mark.parametrize(
    ("policy_text", "expected_error"),
    (
        (_policy(expires_on="20260930"), "valid ISO date"),
        (_policy().replace("    expires-on: 2026-09-30\n", ""), "expires-on"),
    ),
)
def test_missing_or_malformed_grype_expiry_fails_closed(
    tmp_path: Path, policy_text: str, expected_error: str
) -> None:
    from prod_readiness_audit.grype_policy import (
        GrypePolicyError,
        validate_grype_policy,
    )

    policy = tmp_path / "grype-ignore.yaml"
    policy.write_text(policy_text, encoding="utf-8")

    with pytest.raises(GrypePolicyError, match=expected_error):
        validate_grype_policy(policy, today=date(2026, 8, 3))


@pytest.mark.parametrize(
    ("policy_text", "expected_error"),
    (
        (_policy().replace("    reason:", "    rationale:"), "reason"),
        (_policy().replace("Owner: Platform. ", ""), "Owner"),
        (_policy().replace("Decision: temporary acceptance. ", ""), "Decision"),
        (
            _policy().replace(
                "Scanner evidence: Grype reports the exact affected package. ", ""
            ),
            "Scanner evidence",
        ),
        (
            _policy().replace(
                "No-fix proof: upstream has not released a fixed version. ", ""
            ),
            "No-fix proof",
        ),
        (
            _policy().replace("Reachability: vulnerable path is not used. ", ""),
            "Reachability",
        ),
        (_policy().replace("Exit: upgrade the runtime.", ""), "Exit"),
    ),
)
def test_grype_suppression_without_required_risk_metadata_fails_closed(
    tmp_path: Path, policy_text: str, expected_error: str
) -> None:
    from prod_readiness_audit.grype_policy import (
        GrypePolicyError,
        validate_grype_policy,
    )

    policy = tmp_path / "grype-ignore.yaml"
    policy.write_text(policy_text, encoding="utf-8")

    with pytest.raises(GrypePolicyError, match=expected_error):
        validate_grype_policy(policy, today=date(2026, 8, 3))


@pytest.mark.parametrize(
    ("policy_text", "expected_error"),
    (
        (_policy().replace("ignore:\n", "suppressions:\n"), "top-level ignore"),
        (_policy().replace("CVE-2026-15308", "GHSA-abcd-1234"), "vulnerability"),
        (_policy().replace("CVE-2026-15308", "CVE-*"), "vulnerability"),
        (_policy().replace("CVE-2026-15308", ""), "vulnerability"),
        (_policy().replace("      name: python\n", ""), "package.name"),
        (_policy().replace("      name: python", "      name: *"), "package.name"),
        (_policy().replace("      name: python", "      name:"), "package.name"),
        (
            _policy().replace(
                "    package:\n      name: python\n      version: 3.13.14\n",
                "    package:\n      type: binary\n    unrelated:\n      name: python\n      version: 3.13.14\n",
            ),
            "package.name",
        ),
        (_policy().replace("      version: 3.13.14\n", ""), "package.version"),
        (
            _policy().replace("      version: 3.13.14", "      version: 3.13.*"),
            "package.version",
        ),
        (
            _policy().replace("      version: 3.13.14", "      version:"),
            "package.version",
        ),
    ),
)
def test_grype_suppression_requires_exact_vulnerability_and_package_selectors(
    tmp_path: Path, policy_text: str, expected_error: str
) -> None:
    from prod_readiness_audit.grype_policy import (
        GrypePolicyError,
        validate_grype_policy,
    )

    policy = tmp_path / "grype-ignore.yaml"
    policy.write_text(policy_text, encoding="utf-8")

    with pytest.raises(GrypePolicyError, match=expected_error):
        validate_grype_policy(policy, today=date(2026, 8, 3))


@pytest.mark.parametrize(
    ("policy_text", "expected_error"),
    (
        (_policy().replace("      type: binary\n", ""), "package.type"),
        (_policy().replace("      type: binary", "      type: *"), "package.type"),
        (_policy().replace("      type: binary", "      type: python"), "package.type"),
        (_policy().replace("      type: binary", "    type: binary"), "package.type"),
        (
            _policy().replace("      location: /usr/local/bin/python3.13\n", ""),
            "package.location",
        ),
        (
            _policy().replace(
                "      location: /usr/local/bin/python3.13",
                "      location: /usr/local/**",
            ),
            "package.location",
        ),
        (
            _policy().replace(
                "      location: /usr/local/bin/python3.13",
                "      location: /usr/local/lib/libpython3.13.so.1.0",
            ),
            "package.location",
        ),
        (
            _policy().replace(
                "      location: /usr/local/bin/python3.13",
                "    location: /usr/local/bin/python3.13",
            ),
            "package.location",
        ),
    ),
)
def test_htmlparser_suppression_requires_exact_observed_binary_location(
    tmp_path: Path, policy_text: str, expected_error: str
) -> None:
    from prod_readiness_audit.grype_policy import (
        GrypePolicyError,
        validate_grype_policy,
    )

    policy = tmp_path / "grype-ignore.yaml"
    policy.write_text(policy_text, encoding="utf-8")

    with pytest.raises(GrypePolicyError, match=expected_error):
        validate_grype_policy(policy, today=date(2026, 8, 3))


def test_prod_readiness_validates_grype_policy_before_scanning() -> None:
    from prod_readiness_audit.phases import build_prod_readiness_phases
    from prod_readiness_audit.run_state import build_run_state

    state = build_run_state(root_dir=REPO_ROOT, run_id="unit-test")
    phases = build_prod_readiness_phases(state)
    command_ids = [command.command_id for phase in phases for command in phase.commands]
    commands = {
        command.command_id: command for phase in phases for command in phase.commands
    }

    validator = commands["p4_validate_grype_policy"]
    guard_tests = commands["p2_prod_guard_pytests"]
    assert validator.required is True
    assert "prod_readiness_audit.grype_policy" in validator.command
    assert "backend/security/grype-ignore.yaml" in validator.command
    assert "test_prod_readiness_grype_policy.py" in guard_tests.command
    assert command_ids.index("p4_validate_grype_policy") < command_ids.index(
        "p4_grype_backend"
    )


def test_repository_grype_policy_is_valid_before_its_review_date() -> None:
    from prod_readiness_audit.grype_policy import validate_grype_policy

    validate_grype_policy(GRYPE_IGNORE, today=date(2026, 8, 3))
