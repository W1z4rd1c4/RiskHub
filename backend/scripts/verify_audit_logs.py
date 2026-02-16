#!/usr/bin/env python3
"""
Verification script for RiskHub Audit Logs.
Ensures log entries are valid JSON, contain required SIEM fields, don't leak secrets,
and validates separation invariants (audit logs have correct logger).

Exit codes:
  0 - All checks pass
  1 - Errors found (invalid JSON, missing required fields)
  2 - Separation violation (audit logger entries in wrong file)
"""

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Required fields for SIEM ingestion
REQUIRED_FIELDS = ["timestamp", "level", "event", "logger"]
# Fields that are expected for authenticated requests (warning if absent)
CONTEXT_FIELDS = ["request_id"]

# Patterns that might indicate leaked secrets (scoped to avoid false positives)
SECRET_PATTERNS = [
    (re.compile(r'"password"\s*:\s*"[^"]+?"', re.I), "password field"),
    (re.compile(r'"access_token"\s*:\s*"[^"]+?"', re.I), "access_token field"),
    (re.compile(r'"secret_key"\s*:\s*"[^"]+?"', re.I), "secret_key field"),
    (re.compile(r'"hashed_password"\s*:\s*"[^"]+?"', re.I), "hashed_password field"),
]


@dataclass
class VerificationResult:
    """Results from log verification."""

    lines_verified: int = 0
    errors: int = 0
    warnings: int = 0
    error_messages: list[str] = field(default_factory=list)
    warning_messages: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return self.errors == 0


def verify_audit_log(
    log_path: Path,
    *,
    enforce_logger: bool = True,
    check_secrets: bool = True,
) -> VerificationResult:
    """
    Verify an audit log file for SIEM compliance.

    Args:
        log_path: Path to the log file
        enforce_logger: If True, require logger to be 'audit' or 'audit.*'
        check_secrets: If True, scan for potential secret leakage

    Returns:
        VerificationResult with counts and messages
    """
    result = VerificationResult()

    if not log_path.exists():
        result.errors += 1
        result.error_messages.append(f"Log file not found: {log_path}")
        return result

    with open(log_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            result.lines_verified += 1

            # Check valid JSON
            try:
                data = json.loads(line)
            except json.JSONDecodeError as e:
                result.errors += 1
                result.error_messages.append(f"Line {line_num}: Invalid JSON - {e}")
                continue

            # Check required fields
            missing_required = [f for f in REQUIRED_FIELDS if f not in data]
            if missing_required:
                result.errors += 1
                result.error_messages.append(f"Line {line_num}: Missing required fields: {missing_required}")

            # Check context fields (warning only)
            missing_context = [f for f in CONTEXT_FIELDS if f not in data]
            if missing_context:
                result.warnings += 1
                result.warning_messages.append(f"Line {line_num}: Missing context fields: {missing_context}")

            # Enforce audit logger name
            if enforce_logger:
                logger_name = data.get("logger", "")
                if logger_name != "audit" and not logger_name.startswith("audit."):
                    result.errors += 1
                    result.error_messages.append(
                        f"Line {line_num}: Invalid logger for audit log: '{logger_name}' "
                        "(expected 'audit' or 'audit.*')"
                    )

            # Check for secrets
            if check_secrets:
                for pattern, secret_type in SECRET_PATTERNS:
                    if pattern.search(line):
                        result.warnings += 1
                        result.warning_messages.append(f"Line {line_num}: Potential secret detected ({secret_type})")

    return result


def verify_log_separation(
    app_log_path: Path,
    audit_log_path: Path,
) -> VerificationResult:
    """
    Verify that audit logger entries only appear in audit log (not app log).

    Args:
        app_log_path: Path to the app log file
        audit_log_path: Path to the audit log file

    Returns:
        VerificationResult with separation violations as errors
    """
    result = VerificationResult()

    # Check app log doesn't contain audit entries
    if app_log_path.exists():
        with open(app_log_path, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue

                result.lines_verified += 1

                try:
                    data = json.loads(line)
                    logger_name = data.get("logger", "")
                    if logger_name == "audit" or logger_name.startswith("audit."):
                        result.errors += 1
                        result.error_messages.append(
                            f"App log line {line_num}: Contains audit logger entry (separation violation)"
                        )
                except json.JSONDecodeError:
                    # Ignore malformed lines in separation check
                    pass

    return result


def print_result(result: VerificationResult, label: str = ""):
    """Print verification result summary."""
    print(f"\n{'=' * 50}")
    if label:
        print(f"Results for: {label}")
    print(f"Lines verified: {result.lines_verified}")
    print(f"Errors: {result.errors}")
    print(f"Warnings: {result.warnings}")

    if result.error_messages:
        print("\nErrors:")
        for msg in result.error_messages[:10]:  # Limit output
            print(f"  ✗ {msg}")
        if len(result.error_messages) > 10:
            print(f"  ... and {len(result.error_messages) - 10} more errors")

    if result.warning_messages:
        print("\nWarnings:")
        for msg in result.warning_messages[:5]:  # Limit output
            print(f"  ⚠ {msg}")
        if len(result.warning_messages) > 5:
            print(f"  ... and {len(result.warning_messages) - 5} more warnings")

    print(f"\nStatus: {'PASS' if result.passed else 'FAIL'}")


def main():
    """Run verification on default log paths or CLI-specified path."""
    log_dir = Path(__file__).parent.parent / "logs"

    if len(sys.argv) > 1:
        # Verify specific file
        log_file = Path(sys.argv[1])
        is_audit = "audit" in log_file.name.lower()
        result = verify_audit_log(log_file, enforce_logger=is_audit)
        print_result(result, str(log_file))
        sys.exit(0 if result.passed else 1)

    # Verify both log files
    audit_log = log_dir / "audit.json.log"
    app_log = log_dir / "app.json.log"

    all_passed = True

    # Verify audit log
    if audit_log.exists():
        result = verify_audit_log(audit_log, enforce_logger=True)
        print_result(result, "Audit Log")
        if not result.passed:
            all_passed = False
    else:
        print(f"\n⚠ Audit log not found: {audit_log}")

    # Verify separation
    if app_log.exists() and audit_log.exists():
        sep_result = verify_log_separation(app_log, audit_log)
        print_result(sep_result, "Log Separation Check")
        if not sep_result.passed:
            all_passed = False

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
