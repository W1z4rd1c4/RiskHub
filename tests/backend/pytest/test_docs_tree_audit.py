from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = REPO_ROOT / "scripts" / "tools" / "docs_tree_audit.py"
SPEC = importlib.util.spec_from_file_location("docs_tree_audit", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_resolve_target_rejects_file_uri_local_paths() -> None:
    status, reason, resolved = MODULE.resolve_target(
        Path(".planning/README.md"),
        "file:///Users/alice/work/repo/docs/README.md",
    )

    assert (status, reason, resolved) == (
        "unresolved",
        "forbidden_local_path_target",
        "/Users/alice/work/repo/docs/README.md",
    )


def test_resolve_target_rejects_absolute_local_paths() -> None:
    status, reason, resolved = MODULE.resolve_target(
        Path(".planning/README.md"),
        "/Users/alice/work/repo/docs/README.md",
    )

    assert (status, reason, resolved) == (
        "unresolved",
        "forbidden_local_path_target",
        "/Users/alice/work/repo/docs/README.md",
    )


def test_resolve_target_rejects_windows_local_paths() -> None:
    status, reason, resolved = MODULE.resolve_target(
        Path(".planning/README.md"),
        r"C:\Users\alice\repo\docs\README.md",
    )

    assert (status, reason, resolved) == (
        "unresolved",
        "forbidden_local_path_target",
        r"C:\Users\alice\repo\docs\README.md",
    )


def test_resolve_target_keeps_repo_relative_links_valid() -> None:
    status, reason, resolved = MODULE.resolve_target(
        Path(".planning/README.md"),
        "../docs/README.md",
    )

    assert status == "resolved_repo"
    assert reason == "ok"
    assert resolved == "docs/README.md"


def test_resolve_target_keeps_repo_root_absolute_markdown_links_valid() -> None:
    status, reason, resolved = MODULE.resolve_target(
        Path(".planning/README.md"),
        "/docs/README.md",
    )

    assert status == "resolved_repo"
    assert reason == "ok"
    assert resolved == "docs/README.md"


def test_resolve_target_keeps_app_routes_ignored() -> None:
    status, reason, resolved = MODULE.resolve_target(
        Path(".planning/README.md"),
        "/login",
    )

    assert (status, reason, resolved) == ("ignored", "app_route", None)
