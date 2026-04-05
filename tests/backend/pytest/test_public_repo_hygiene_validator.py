from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

import pytest


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


@pytest.mark.parametrize(
    ("sample", "reason"),
    [
        ("/Users/alice/project", "absolute POSIX user path"),
        ("/home/alice/project", "absolute POSIX user path"),
        ("file:///Users/alice/project", "absolute local file URI"),
        (r"C:\Users\alice\project", "absolute Windows user path"),
    ],
)
def test_content_findings_detect_root_only_user_paths(sample: str, reason: str) -> None:
    findings = MODULE.content_findings(Path("docs/example.md"), sample)

    assert len(findings) == 1
    assert findings[0].reason == reason
    assert findings[0].match == sample


@pytest.mark.parametrize(
    "sample",
    [
        "/home/riskhub/.local/bin/python",
        "/home/zap/zap_out.json",
        "/home/youruser/.config/tool/config.json",
        "file:///home/riskhub/.local/bin/python",
        "file:///home/zap/zap_out.json",
        "file:///home/youruser/.config/tool/config.json",
    ],
)
def test_content_findings_ignore_safe_home_prefixes(sample: str) -> None:
    findings = MODULE.content_findings(Path("docs/example.md"), sample)

    assert findings == []


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


def test_scan_history_patch_output_detects_sensitive_paths() -> None:
    output = "\n".join(
        [
            f"{MODULE.PATCH_COMMIT_PREFIX}deadbeef",
            "diff --git a/docs/example.md b/docs/example.md",
            "@@ -1 +1 @@",
            "+See /Users/alice/project for the original.",
        ]
    )

    findings = MODULE.scan_history_patch_output(output)

    assert len(findings) == 1
    assert findings[0].commit == "deadbeef"
    assert findings[0].path == "docs/example.md"
    assert findings[0].match == "/Users/alice/project"


def test_scan_history_patch_output_ignores_safe_prefixes() -> None:
    output = "\n".join(
        [
            f"{MODULE.PATCH_COMMIT_PREFIX}feedface",
            "diff --git a/docs/example.md b/docs/example.md",
            "@@ -1 +1 @@",
            "+ANTIGRAVITY_CONFIG_DIR=/home/youruser/.config npx get-shit-done-cc --global",
            "Binary files a/assets.bin and b/assets.bin differ",
        ]
    )

    findings = MODULE.scan_history_patch_output(output)

    assert findings == []


def test_scan_history_message_output_detects_sensitive_paths() -> None:
    output = "\n".join(
        [
            f"{MODULE.MESSAGE_COMMIT_PREFIX}cafebabe",
            "docs: fix /Users/alice/project reference",
            MODULE.MESSAGE_END_MARKER,
        ]
    )

    findings = MODULE.scan_history_message_output(output)

    assert len(findings) == 1
    assert findings[0].commit == "cafebabe"
    assert findings[0].path == "<commit-message>"
    assert findings[0].match == "/Users/alice/project"
