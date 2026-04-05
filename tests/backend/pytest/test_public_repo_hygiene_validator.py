from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = REPO_ROOT / "scripts" / "security" / "validate_public_repo_hygiene.py"
SPEC = importlib.util.spec_from_file_location("validate_public_repo_hygiene", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_content_findings_detect_absolute_posix_path() -> None:
    findings = MODULE.content_findings(
        Path("docs/example.md"),
        "See /Users/alice/work/repo/docs/guide.md for the original.",
    )

    assert len(findings) == 1
    assert findings[0].reason == "absolute POSIX user path"
    assert findings[0].match == "/Users/alice/work/repo/docs/guide.md"


def test_content_findings_detect_file_uri() -> None:
    findings = MODULE.content_findings(
        Path("docs/example.md"),
        "[guide](file:///Users/alice/work/repo/docs/guide.md)",
    )

    assert len(findings) == 1
    assert findings[0].reason == "absolute local file URI"
    assert findings[0].match == "file:///Users/alice/work/repo/docs/guide.md"


def test_content_findings_detect_windows_user_path() -> None:
    findings = MODULE.content_findings(
        Path("docs/example.md"),
        r"Legacy export lived at C:\Users\alice\repo\docs\guide.md",
    )

    assert len(findings) == 1
    assert findings[0].reason == "absolute Windows user path"
    assert findings[0].match == r"C:\Users\alice\repo\docs\guide.md"


def test_content_findings_allowlisted_validator_files_can_contain_patterns() -> None:
    findings = MODULE.content_findings(
        Path("scripts/security/run_public_repo_leak_audit.sh"),
        "rg 'file:///Users/|/Users/alice/repo/docs/guide.md'",
    )

    assert findings == []


def test_path_findings_detect_tracked_generated_outputs() -> None:
    findings = MODULE.path_findings(Path("tests/results/security/report.json"))

    assert len(findings) == 1
    assert findings[0].reason == "tracked generated/local-only artifact directory"
