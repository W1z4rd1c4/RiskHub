from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]


def _read(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def _tree(relative_path: str) -> ast.Module:
    return ast.parse(_read(relative_path), filename=relative_path)


def _annotation_name(node: ast.AST | None) -> str:
    if node is None:
        return ""
    return ast.unparse(node)


def test_register_listing_plan_annotations_stay_parameterized() -> None:
    lifecycle = _read("backend/app/services/_register_listings/lifecycle.py")
    assert "RegisterListingPlan[Any, Any]" not in lifecycle

    for relative_path in (
        "backend/app/services/_register_listings/risks.py",
        "backend/app/services/_register_listings/controls.py",
        "backend/app/services/_register_listings/kris.py",
        "backend/app/services/_register_listings/vendors.py",
        "backend/app/services/_register_listings/issues.py",
    ):
        tree = _tree(relative_path)
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            return_annotation = _annotation_name(node.returns)
            assert return_annotation != "RegisterListingPlan", (
                f"{relative_path}:{node.name} must return a parameterized RegisterListingPlan"
            )


def test_domain_error_handler_adapter_does_not_reraise_exception() -> None:
    main_tree = _tree("backend/app/main.py")
    for node in ast.walk(main_tree):
        if isinstance(node, ast.Raise) and isinstance(node.exc, ast.Name):
            assert node.exc.id != "exc"


def test_kri_archive_response_uses_status_constant() -> None:
    archive_plans = _read("backend/app/services/_entity_mutation_lifecycle/archive_plans.py")
    assert "Response(status_code=204)" not in archive_plans
    assert "status.HTTP_204_NO_CONTENT" in archive_plans


def test_kri_breach_notification_warning_message_is_bounded() -> None:
    direct_application = _read("backend/app/services/_kri_history/direct_application.py")
    assert "MAX_KRI_BREACH_NOTIFICATION_WARNING_LENGTH" in direct_application
    assert "format_kri_breach_notification_warning" in direct_application


def test_audit_log_activity_return_type_is_not_any() -> None:
    audit_types = _read("backend/app/core/audit/types.py")
    assert "Awaitable[Any]" not in audit_types
    assert "Awaitable[object]" in audit_types
