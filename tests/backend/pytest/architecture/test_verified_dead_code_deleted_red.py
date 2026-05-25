from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

REPO_ROOT = Path(__file__).resolve().parents[4]

DELETED_BACKEND_PATHS = (
    "backend/app/api/v1/endpoints/auth/_sso_helpers.py",
    "backend/app/api/v1/endpoints/controls/_helpers.py",
    "backend/app/services/_approval_execution/kri_changes.py",
    "backend/app/api/v1/endpoints/vendors/_shared.py",
    "backend/app/services/_directory_sync",
    "backend/app/api/v1/endpoints/issues/_shared/README.md",
    "backend/app/api/v1/endpoints/issues/_shared/__init__.py",
    "backend/app/api/v1/endpoints/issues/_shared/constants.py",
    "backend/app/api/v1/endpoints/issues/_shared/serialization.py",
    "backend/app/api/v1/endpoints/issues/_shared/source.py",
    "backend/app/services/_reporting/counts.py",
    "scripts/security/authz_validator/README.md",
    "scripts/security/authz_validator/__init__.py",
    "scripts/security/authz_validator/capability_catalog.py",
    "scripts/security/authz_validator/cli.py",
    "scripts/security/authz_validator/contract_manifest.py",
    "scripts/security/authz_validator/discovery.py",
    "scripts/security/authz_validator/frontend_local_gates.py",
    "scripts/security/authz_validator/frontend_routes.py",
    "scripts/security/authz_validator/git_inputs.py",
    "scripts/security/authz_validator/markdown_validation.py",
    "scripts/security/authz_validator/models.py",
    "scripts/security/authz_validator/runner.py",
)

DELETED_BACKEND_SYMBOLS = (
    "DashboardMetricOutcome",
    "DashboardMetricPlan",
    "DashboardSnapshotDecision",
    "DeadlineRunOutcome",
    "DeadlineRunPlan",
    "DirectoryImportOutcome",
    "DirectorySyncOutcome",
    "EntityApprovalPlan",
    "EntityDirectApplyPlan",
    "EntityMutationOptions",
    "IssueLinkedContextDefinition",
    "IssueRegisterPlan",
    "IssueSourceMutationPlan",
    "MetricAvailability",
    "RegisterListingCriteria",
    "RegisterListingDefinition",
    "RegisterSerializerContext",
    "ReportExportExecutionPlan",
    "ReportExportOutcome",
    "VendorLinkAccessPlan",
    "VendorLinkedResourceProjection",
    "VendorReportDefinition",
    "apply_kri_value_as_of",
    "build_deadline_notification_plan",
    "count_high_risks",
    "get_config_sync",
)


@pytest.mark.parametrize("relative_path", DELETED_BACKEND_PATHS)
def test_verified_dead_backend_paths_are_deleted(relative_path: str) -> None:
    assert not (REPO_ROOT / relative_path).exists(), f"{relative_path} is verified dead and must stay deleted"


def test_verified_dead_backend_symbols_are_deleted() -> None:
    offenders: list[str] = []
    for path in (REPO_ROOT / "backend/app").rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        names: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
                names.add(node.name)
            elif isinstance(node, ast.Name):
                names.add(node.id)
            elif isinstance(node, ast.ImportFrom | ast.Import):
                names.update(alias.name for alias in node.names)
        for symbol in DELETED_BACKEND_SYMBOLS:
            if symbol in names:
                offenders.append(f"{path.relative_to(REPO_ROOT)}:{symbol}")

    assert offenders == []


def test_entity_mutation_kind_excludes_dead_statuses() -> None:
    tree = ast.parse(
        (REPO_ROOT / "backend/app/services/_entity_mutation_lifecycle/contracts.py").read_text(encoding="utf-8")
    )
    mutation_kind_values: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == "EntityMutationKind" for target in node.targets):
            continue
        value = node.value
        if isinstance(value, ast.Subscript) and isinstance(value.value, ast.Name) and value.value.id == "Literal":
            slice_node = value.slice
            elements = slice_node.elts if isinstance(slice_node, ast.Tuple) else [slice_node]
            mutation_kind_values = [item.value for item in elements if isinstance(item, ast.Constant)]

    assert mutation_kind_values == ["applied", "approval_queued"]
