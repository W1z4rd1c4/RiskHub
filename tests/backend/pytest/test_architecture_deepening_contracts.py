from __future__ import annotations

import ast
import inspect
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def _source(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def _tree(relative_path: str) -> ast.Module:
    return ast.parse(_source(relative_path), filename=relative_path)


def _defined_class_names(relative_path: str) -> set[str]:
    return {node.name for node in ast.walk(_tree(relative_path)) if isinstance(node, ast.ClassDef)}


def _defined_function_names(relative_path: str) -> set[str]:
    return {
        node.name
        for node in ast.walk(_tree(relative_path))
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
    }


def _imports_module(relative_path: str, module_name: str) -> bool:
    for node in ast.walk(_tree(relative_path)):
        if isinstance(node, ast.Import):
            if any(alias.name == module_name for alias in node.names):
                return True
        if isinstance(node, ast.ImportFrom) and node.module == module_name:
            return True
    return False


def _imports_relative_module(relative_path: str, module_name: str) -> bool:
    for node in ast.walk(_tree(relative_path)):
        if isinstance(node, ast.ImportFrom) and node.level > 0 and node.module == module_name:
            return True
    return False


def _has_varargs_forwarder(relative_path: str) -> bool:
    for node in ast.walk(_tree(relative_path)):
        if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        if node.args.vararg is None and node.args.kwarg is None:
            continue
        body_source = ast.get_source_segment(_source(relative_path), node) or ""
        if "return " in body_source and ("*args" in body_source or "**kwargs" in body_source):
            return True
    return False


def _production_frontend_import_count(export_name: str) -> int:
    count = 0
    for path in (REPO_ROOT / "frontend" / "src").rglob("*.ts*"):
        if path.name.endswith(".test.ts") or path.name.endswith(".test.tsx"):
            continue
        if export_name in path.read_text(encoding="utf-8"):
            count += 1
    return count


def test_risk_questionnaire_routes_use_lifecycle_interface() -> None:
    from app.api.v1.endpoints.risk_questionnaires import clarifications, questionnaire
    from app.services._risk_questionnaires import lifecycle

    assert hasattr(lifecycle, "QuestionnaireLifecycleOutcome")
    assert hasattr(lifecycle, "QuestionnaireClarificationOutcome")
    assert hasattr(lifecycle, "QuestionnaireLifecycleOptions")

    questionnaire_source = inspect.getsource(questionnaire)
    clarification_source = inspect.getsource(clarifications)
    route_source = questionnaire_source + clarification_source

    for lifecycle_function in (
        "read_questionnaire_detail",
        "open_questionnaire_detail",
        "save_questionnaire_draft_detail",
        "submit_questionnaire_detail",
        "request_questionnaire_clarification_detail",
        "respond_questionnaire_clarification_detail",
    ):
        assert lifecycle_function in route_source

    for low_level_function in (
        "open_questionnaire_for_user(",
        "save_questionnaire_draft(",
        "submit_questionnaire_for_user(",
        "request_questionnaire_clarification,",
        "respond_to_questionnaire_clarification as",
    ):
        assert low_level_function not in route_source


def test_control_execution_and_link_routes_use_governance_interface() -> None:
    from app.api.v1.endpoints import executions
    from app.api.v1.endpoints.controls import linking as control_linking
    from app.api.v1.endpoints.risks import control_links as risk_control_links
    from app.services._control_execution import link_governance

    assert hasattr(link_governance, "ControlExecutionProjection")
    assert hasattr(link_governance, "ControlRiskLinkOutcome")
    assert hasattr(link_governance, "ControlRiskAccessDecision")

    route_source = (
        inspect.getsource(executions)
        + inspect.getsource(control_linking)
        + inspect.getsource(risk_control_links)
    )

    for governance_function in (
        "list_control_execution_projections",
        "read_control_execution_projection",
        "create_control_execution_projection",
        "list_control_risk_links",
        "create_control_risk_link",
        "delete_control_risk_link",
        "list_risk_control_links",
        "create_risk_control_link",
        "delete_risk_control_link",
    ):
        assert governance_function in route_source

    for leaked_helper in (
        "visible_risk_ids(",
        "load_monitoring_response_context(",
        "linked_risk_names_for_visible_ids(",
    ):
        assert leaked_helper not in route_source


def test_control_execution_governance_uses_split_modules() -> None:
    from app.services._control_execution import access, link_governance, link_policy, monitoring, projection

    assert hasattr(access, "ControlRiskAccessDecision")
    assert hasattr(projection, "ControlExecutionProjection")
    assert hasattr(monitoring, "load_control_execution_monitoring_context")
    assert hasattr(link_policy, "ControlRiskLinkPlan")

    governance_source = inspect.getsource(link_governance)
    assert "from app.services._control_execution.monitoring" in governance_source
    assert "app.api.v1.endpoints" not in governance_source


def test_directory_identity_facade_uses_lifecycle_module() -> None:
    from app.services import directory_identity_service
    from app.services._directory_identity import lifecycle

    assert hasattr(lifecycle, "DirectoryImportOutcome")
    assert hasattr(lifecycle, "DirectorySyncOutcome")
    assert hasattr(lifecycle, "DirectoryProfileUpdateOutcome")
    assert hasattr(lifecycle, "DirectoryReenableOutcome")

    assert directory_identity_service.apply_directory_profile is lifecycle.apply_directory_profile
    assert directory_identity_service.requires_break_glass_for_reenable is lifecycle.requires_break_glass_for_reenable

    facade_source = inspect.getsource(directory_identity_service)
    assert "async def apply_directory_profile" not in facade_source
    assert "async def resolve_or_create_department" not in facade_source


def test_identity_access_routes_use_lifecycle_module() -> None:
    from app.api.v1.endpoints import access, directory
    from app.api.v1.endpoints.users import detail as users_detail
    from app.services import access_user_service
    from app.services._identity_access_lifecycle import lifecycle

    assert hasattr(lifecycle, "IdentityImportOutcome")
    assert hasattr(lifecycle, "AccessProfileUpdateOutcome")
    assert hasattr(lifecycle, "AccessScopePlan")

    route_source = (
        inspect.getsource(users_detail)
        + inspect.getsource(directory)
        + inspect.getsource(access)
        + inspect.getsource(access_user_service)
    )

    for lifecycle_function in (
        "update_user_profile",
        "import_directory_identity",
        "update_access_profile",
    ):
        assert lifecycle_function in route_source

    for leaked_rule in (
        "requires_break_glass_for_reenable(",
        "OrphanedItemService.flag_orphaned_items",
        "_resolve_role_for_import(",
    ):
        assert leaked_rule not in route_source


def test_orphan_services_use_governance_definitions() -> None:
    from app.services._orphaned_items import core, governance, resolution, workflow

    assert hasattr(governance, "OrphanItemDefinition")
    assert hasattr(governance, "OrphanDetectionPlan")
    assert hasattr(governance, "OrphanResolutionPlan")
    assert hasattr(governance, "OrphanDisplayProjection")
    assert set(governance.ORPHAN_ITEM_DEFINITIONS) >= {"risk", "control", "kri"}

    core_source = inspect.getsource(core)
    workflow_source = inspect.getsource(workflow)
    resolution_source = inspect.getsource(resolution)

    assert "load_orphan_display_projection" in core_source
    assert "orphan_capability_flags" in workflow_source
    assert "orphan_item_definition" in resolution_source


def test_orphan_resolution_requirements_come_from_governance() -> None:
    from app.services._orphaned_items import governance, resolution_plan

    assert hasattr(governance, "orphan_resolution_requirements")

    plan_source = inspect.getsource(resolution_plan)
    assert "orphan_resolution_requirements" in plan_source
    assert 'item_type in {"risk", "control"}' not in plan_source
    assert 'item_type == "kri"' not in plan_source


def test_auth_routes_use_session_outcome_module() -> None:
    from app.api.v1.endpoints.auth import refresh, sso
    from app.services._auth_session import outcomes

    assert hasattr(outcomes, "RefreshSessionOutcome")
    assert hasattr(outcomes, "SsoSessionOutcome")
    assert hasattr(outcomes, "SessionCookiePlan")
    assert hasattr(outcomes, "SessionAuditPlan")
    assert hasattr(outcomes, "resolve_refresh_session")
    assert hasattr(outcomes, "resolve_sso_start")
    assert hasattr(outcomes, "resolve_sso_exchange")
    assert hasattr(outcomes, "apply_session_cookie_plan")
    assert hasattr(outcomes, "record_session_audit_plan")

    refresh_source = inspect.getsource(refresh)
    sso_source = inspect.getsource(sso)

    assert "resolve_refresh_session" in refresh_source
    assert "resolve_sso_start" in sso_source
    assert "resolve_sso_exchange" in sso_source
    assert "_revoke_rotated_refresh_descendants" not in refresh_source
    assert "_jit_provision_user" not in sso_source


def test_auth_session_outcomes_delegate_to_split_modules() -> None:
    from app.services._auth_session import audit, cookies, jit, outcomes, refresh, sso_challenges, sso_identity

    assert hasattr(refresh, "resolve_refresh_session")
    assert hasattr(sso_challenges, "resolve_sso_start")
    assert hasattr(sso_challenges, "resolve_sso_exchange")
    assert hasattr(sso_identity, "verify_sso_identity")
    assert hasattr(jit, "resolve_jit_user")
    assert hasattr(cookies, "apply_session_cookie_plan")
    assert hasattr(audit, "record_session_audit_plan")

    for module_name in (
        "audit",
        "cookies",
        "jit",
        "refresh",
        "sso_challenges",
        "sso_identity",
    ):
        assert _imports_relative_module("backend/app/services/_auth_session/outcomes.py", module_name)

    outcome_source = inspect.getsource(outcomes)
    assert "app.api.v1.endpoints.auth" not in outcome_source


def test_auth_session_split_modules_are_not_facade_back_wrappers() -> None:
    for relative_path in (
        "backend/app/services/_auth_session/refresh.py",
        "backend/app/services/_auth_session/sso_challenges.py",
        "backend/app/services/_auth_session/jit.py",
    ):
        assert not _imports_module(relative_path, "app.services._auth_session.outcomes")
        assert "from . import outcomes" not in _source(relative_path)
        assert not _has_varargs_forwarder(relative_path)

    outcome_source = _source("backend/app/services/_auth_session/outcomes.py")
    for implementation_detail in (
        "descendant_stmt =",
        "select(RefreshToken).where",
        "SsoChallenge(",
        "normalize_business_role(",
    ):
        assert implementation_detail not in outcome_source


def test_riskhub_config_routes_use_lifecycle_contracts() -> None:
    from app.api.v1.endpoints.riskhub import approval_scenarios, departments, risk_types, roles
    from app.services._riskhub_config import lifecycle

    assert hasattr(lifecycle, "ConfigEntityDefinition")
    assert hasattr(lifecycle, "ConfigLifecycleOutcome")
    assert hasattr(lifecycle, "ConfigAuditPlan")
    assert hasattr(lifecycle, "build_config_audit_plan")
    assert hasattr(lifecycle, "run_config_create")
    assert hasattr(lifecycle, "run_config_update")
    assert hasattr(lifecycle, "run_config_delete")
    assert hasattr(lifecycle, "run_config_restore")

    route_source = (
        inspect.getsource(roles)
        + inspect.getsource(departments)
        + inspect.getsource(risk_types)
        + inspect.getsource(approval_scenarios)
    )
    for lifecycle_function in (
        "run_config_create",
        "run_config_update",
        "run_config_delete",
        "run_config_restore",
    ):
        assert lifecycle_function in route_source


def test_quarterly_comparison_service_is_composition_facade() -> None:
    from app.services import quarterly_comparison_service
    from app.services._quarterly_comparison import composition

    assert hasattr(composition, "QuarterMetricComposition")
    assert hasattr(composition, "SnapshotSourceDecision")
    assert hasattr(composition, "MetricAvailability")
    assert quarterly_comparison_service.build_quarterly_comparison is composition.build_quarterly_comparison

    facade_source = inspect.getsource(quarterly_comparison_service)
    assert "async def build_quarterly_comparison" not in facade_source


def test_entity_mutation_routes_use_lifecycle_interface() -> None:
    from app.api.v1.endpoints.controls.crud import archive as control_archive
    from app.api.v1.endpoints.controls.crud import update as control_update
    from app.api.v1.endpoints.kris.crud import archive as kri_archive
    from app.api.v1.endpoints.kris.crud import update as kri_update
    from app.api.v1.endpoints.risks.crud import archive as risk_archive
    from app.api.v1.endpoints.risks.crud import update as risk_update
    from app.services._entity_mutation_lifecycle import lifecycle

    assert hasattr(lifecycle, "EntityMutationOutcome")
    assert hasattr(lifecycle, "EntityMutationOptions")
    assert hasattr(lifecycle, "EntityApprovalPlan")
    assert hasattr(lifecycle, "EntityDirectApplyPlan")

    route_source = (
        inspect.getsource(risk_update)
        + inspect.getsource(risk_archive)
        + inspect.getsource(control_update)
        + inspect.getsource(control_archive)
        + inspect.getsource(kri_update)
        + inspect.getsource(kri_archive)
    )

    for lifecycle_function in (
        "update_risk_detail",
        "archive_risk_detail",
        "update_control_detail",
        "archive_control_detail",
        "update_kri_detail",
        "archive_kri_detail",
    ):
        assert lifecycle_function in route_source

    for approval_choreography in (
        "create_approval_request_with_audit",
        "build_approval_queued_response",
        "load_approval_scenario_policy",
    ):
        assert approval_choreography not in route_source


def test_entity_mutation_lifecycle_uses_split_service_modules() -> None:
    from app.services._entity_mutation_lifecycle import (
        approval_plans,
        archive_plans,
        direct_apply,
        lifecycle,
        policy,
        projection,
    )

    assert hasattr(policy, "assert_no_pending_delete")
    assert hasattr(approval_plans, "create_risk_edit_approval_if_required")
    assert hasattr(direct_apply, "reload_risk_with_relationships")
    assert hasattr(archive_plans, "assert_can_request_delete_risk")
    assert hasattr(projection, "serialize_risk_mutation_response")

    lifecycle_source = inspect.getsource(lifecycle)
    for module_name in (
        "approval_plans",
        "archive_plans",
        "direct_apply",
        "policy",
        "projection",
    ):
        assert f"app.services._entity_mutation_lifecycle.{module_name}" in lifecycle_source

    assert "app.api.v1.endpoints" not in lifecycle_source


def test_register_list_routes_use_listing_planners() -> None:
    from app.api.v1.endpoints.controls.crud import list as control_list
    from app.api.v1.endpoints.issues.crud import list as issue_list
    from app.api.v1.endpoints.kris.crud import list as kri_list
    from app.api.v1.endpoints.risks.crud import list as risk_list
    from app.api.v1.endpoints.vendors import crud as vendor_list
    from app.services._register_listings import lifecycle

    assert hasattr(lifecycle, "RegisterListingCriteria")
    assert hasattr(lifecycle, "RegisterListingPlan")
    assert hasattr(lifecycle, "RegisterListingDefinition")
    assert hasattr(lifecycle, "RegisterSerializerContext")

    route_source = (
        inspect.getsource(risk_list)
        + inspect.getsource(control_list)
        + inspect.getsource(kri_list)
        + inspect.getsource(issue_list)
        + inspect.getsource(vendor_list)
    )

    for planner in (
        "plan_risk_listing",
        "plan_control_listing",
        "plan_kri_listing",
        "plan_issue_listing",
        "plan_vendor_listing",
    ):
        assert planner in route_source

    assert "execute_register_listing_plan" in route_source
    assert "CollectionListingDefinition(" not in route_source


def test_register_list_routes_execute_listing_plans_through_module() -> None:
    from app.api.v1.endpoints.controls.crud import list as control_list
    from app.api.v1.endpoints.issues.crud import list as issue_list
    from app.api.v1.endpoints.kris.crud import list as kri_list
    from app.api.v1.endpoints.risks.crud import list as risk_list
    from app.api.v1.endpoints.vendors import crud as vendor_list
    from app.services._register_listings import lifecycle

    assert hasattr(lifecycle, "execute_register_listing_plan")

    route_source = (
        inspect.getsource(risk_list)
        + inspect.getsource(control_list)
        + inspect.getsource(kri_list)
        + inspect.getsource(issue_list)
        + inspect.getsource(vendor_list)
    )

    assert "execute_register_listing_plan" in route_source
    assert "execute_collection_listing_with_definition" not in route_source


def test_register_listings_use_entity_definition_modules() -> None:
    from app.api.v1.endpoints.controls.crud import list as control_list
    from app.api.v1.endpoints.issues.crud import list as issue_list
    from app.api.v1.endpoints.kris.crud import list as kri_list
    from app.api.v1.endpoints.risks.crud import list as risk_list
    from app.api.v1.endpoints.vendors import crud as vendor_list
    from app.services._register_listings import controls, issues, kris, risks, vendors

    for module, planner in (
        (risks, "plan_risk_listing"),
        (controls, "plan_control_listing"),
        (kris, "plan_kri_listing"),
        (issues, "plan_issue_listing"),
        (vendors, "plan_vendor_listing"),
    ):
        assert hasattr(module, planner)

    route_source = (
        inspect.getsource(risk_list)
        + inspect.getsource(control_list)
        + inspect.getsource(kri_list)
        + inspect.getsource(issue_list)
        + inspect.getsource(vendor_list)
    )

    for local_definition in (
        "def _load_risk_sql_groups",
        "def _load_control_sql_groups",
        "def _load_kri_sql_groups",
        "def _load_vendor_sql_groups",
        "def _risk_group_value_filter",
        "def _control_group_filter",
        "def _kri_group_filter",
        "def _vendor_group_value_filter",
    ):
        assert local_definition not in route_source


def test_collection_contracts_have_one_canonical_definition() -> None:
    duplicate_contracts = []
    for relative_path in (
        "backend/app/api/v1/endpoints/_collection.py",
        "backend/app/api/v1/endpoints/_collection_execution.py",
        "backend/app/services/_collection_contracts.py",
    ):
        class_names = _defined_class_names(relative_path)
        for contract_name in ("CollectionQuery", "CollectionListingDefinition"):
            if contract_name in class_names:
                duplicate_contracts.append((relative_path, contract_name))

    assert duplicate_contracts == [
        ("backend/app/services/_collection_contracts.py", "CollectionQuery"),
        ("backend/app/services/_collection_contracts.py", "CollectionListingDefinition"),
    ]


def test_register_listing_entity_modules_own_planners() -> None:
    for relative_path, planner_name in (
        ("backend/app/services/_register_listings/risks.py", "plan_risk_listing"),
        ("backend/app/services/_register_listings/controls.py", "plan_control_listing"),
        ("backend/app/services/_register_listings/kris.py", "plan_kri_listing"),
        ("backend/app/services/_register_listings/issues.py", "plan_issue_listing"),
        ("backend/app/services/_register_listings/vendors.py", "plan_vendor_listing"),
    ):
        assert planner_name in _defined_function_names(relative_path)
        assert not _has_varargs_forwarder(relative_path)
        assert "from .lifecycle import RegisterListingPlan, plan_" not in _source(relative_path)

    lifecycle_functions = _defined_function_names("backend/app/services/_register_listings/lifecycle.py")
    for old_generic_planner in (
        "plan_risk_listing",
        "plan_control_listing",
        "plan_kri_listing",
        "plan_issue_listing",
        "plan_vendor_listing",
    ):
        assert old_generic_planner not in lifecycle_functions

    route_sources = "\n".join(
        _source(path)
        for path in (
            "backend/app/api/v1/endpoints/risks/crud/list.py",
            "backend/app/api/v1/endpoints/controls/crud/list.py",
            "backend/app/api/v1/endpoints/kris/crud/list.py",
            "backend/app/api/v1/endpoints/issues/crud/list.py",
            "backend/app/api/v1/endpoints/vendors/crud.py",
            "backend/app/api/v1/endpoints/vendors/_listing.py",
        )
    )
    for leaked_detail in (
        "_load_risk_sql_groups",
        "_risk_listing_group_value_filter",
        "_load_control_sql_groups",
        "_control_listing_group_filter",
        "_load_kri_sql_groups",
        "_kri_listing_group_filter",
        "_load_issue_sql_groups",
        "_issue_listing_group_filter",
        "_load_vendor_sql_groups",
        "_vendor_listing_group_value_filter",
    ):
        assert leaked_detail not in route_sources


def test_report_exporters_use_reporting_export_definitions() -> None:
    from app.api.v1.endpoints.reports.unified_exports import (
        export_controls,
        export_issues,
        export_kris,
        export_risks,
        export_vendors,
    )
    from app.services._reporting.exports import lifecycle

    assert hasattr(lifecycle, "ReportExportDefinition")
    assert hasattr(lifecycle, "ReportExportExecutionPlan")
    assert hasattr(lifecycle, "ReportExportOutcome")

    exporter_source = (
        inspect.getsource(export_risks)
        + inspect.getsource(export_controls)
        + inspect.getsource(export_kris)
        + inspect.getsource(export_issues)
        + inspect.getsource(export_vendors)
    )

    assert "ReportExportDefinition(" in exporter_source
    assert "render_report_export_definition(" in exporter_source
    assert "ExportPipelineDefinition(" not in exporter_source


def test_backend_service_modules_do_not_import_endpoint_adapters() -> None:
    services_root = Path(__file__).resolve().parents[3] / "backend" / "app" / "services"
    offenders: list[str] = []
    for path in sorted(services_root.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        source = path.read_text()
        if "app.api.v1.endpoints" in source:
            offenders.append(str(path.relative_to(services_root)))

    assert offenders == []


def test_dashboard_routes_use_metric_composition_module() -> None:
    from app.api.v1.endpoints.dashboard import committee, quarterly, summary
    from app.services._dashboard_metrics import lifecycle

    assert hasattr(lifecycle, "DashboardMetricPlan")
    assert hasattr(lifecycle, "DashboardMetricOutcome")
    assert hasattr(lifecycle, "DashboardSnapshotDecision")

    route_source = inspect.getsource(summary) + inspect.getsource(quarterly) + inspect.getsource(committee)
    for metric_function in (
        "build_dashboard_summary_metrics",
        "build_available_periods",
        "build_committee_summary_metrics",
    ):
        assert metric_function in route_source

    assert "select(func.count(Control.id))" not in inspect.getsource(summary)
    assert "QuarterlyMetricSnapshot" not in inspect.getsource(quarterly)


def test_issue_routes_use_issue_register_linked_context_contracts() -> None:
    from app.api.v1.endpoints.issues.crud import contextual, create
    from app.services._issue_register import linked_context, source_mutation

    assert hasattr(linked_context, "IssueLinkedContextDefinition")
    assert hasattr(linked_context, "IssueRegisterPlan")
    assert hasattr(linked_context, "IssueSourceMutationPlan")
    assert hasattr(source_mutation, "resolve_issue_source_metadata")
    assert hasattr(source_mutation, "resolve_contextual_issue_source")
    assert hasattr(source_mutation, "ensure_issue_source_link")

    route_source = inspect.getsource(create) + inspect.getsource(contextual)
    assert "from app.services._issue_register import" in route_source
    assert "resolve_issue_source_metadata" in route_source
    assert "resolve_contextual_issue_source" in route_source


def test_kri_history_routes_use_governance_interface() -> None:
    from app.api.v1.endpoints.kris import history
    from app.services._kri_history import governance

    assert hasattr(governance, "KriValueGovernanceOutcome")
    assert hasattr(governance, "KriCorrectionPlan")
    assert hasattr(governance, "KriHistoryProjection")

    route_source = inspect.getsource(history)
    for governance_function in (
        "record_kri_value_governance",
        "list_kri_history_projection",
        "correct_kri_history_governance",
    ):
        assert governance_function in route_source

    for route_owned_choreography in (
        "create_kri_history_correction_approval",
        "load_approval_scenario_policy",
        "build_kri_history_response",
    ):
        assert route_owned_choreography not in route_source


def test_kri_history_uses_service_owned_intake_and_projection() -> None:
    from app.services._kri_history import approval_intake, correction_plans, direct_application, governance, projection

    assert hasattr(approval_intake, "create_kri_submission_approval")
    assert hasattr(approval_intake, "create_kri_history_correction_approval")
    assert hasattr(direct_application, "apply_kri_value_directly")
    assert hasattr(projection, "serialize_kri_history_response")
    assert hasattr(correction_plans, "build_kri_correction_plan")

    service_sources = (
        inspect.getsource(approval_intake)
        + inspect.getsource(direct_application)
        + inspect.getsource(governance)
        + inspect.getsource(projection)
    )
    assert "app.api.v1.endpoints" not in service_sources
    assert "approval_intake" in inspect.getsource(governance)


def test_kri_history_direct_application_and_routes_do_not_use_private_wrappers() -> None:
    direct_path = "backend/app/services/_kri_history/direct_application.py"
    assert not _has_varargs_forwarder(direct_path)
    assert "_apply_kri_value_directly" not in _source(direct_path)

    route_sources = "\n".join(
        _source(path)
        for path in (
            "backend/app/api/v1/endpoints/kris/history.py",
            "backend/app/api/v1/endpoints/kris/history_helpers.py",
            "backend/app/api/v1/endpoints/kris/history_submission.py",
            "backend/app/api/v1/endpoints/kris/history_value_application.py",
        )
    )
    for private_import in (
        "from app.services._kri_history.submission import _create_kri_submission_approval",
        "from app.services._kri_history.value_application import _apply_kri_value_directly",
        "from app.services._kri_history.value_application import (",
    ):
        assert private_import not in route_sources


def test_approval_queue_routes_use_queue_lifecycle_module() -> None:
    from app.api.v1.endpoints.approvals import queue, resolve
    from app.services._approval_queue import lifecycle

    assert hasattr(lifecycle, "ApprovalRequestIntakePlan")
    assert hasattr(lifecycle, "ApprovalQueuePage")
    assert hasattr(lifecycle, "ApprovalQueueProjection")

    route_source = inspect.getsource(queue) + inspect.getsource(resolve)
    for lifecycle_function in (
        "create_delete_approval_request",
        "list_approval_queue_page",
        "count_pending_approval_queue",
        "list_my_approval_queue_page",
    ):
        assert lifecycle_function in route_source

    assert "create_approval_request_with_audit" not in route_source


def test_approval_queue_lifecycle_uses_service_owned_helpers() -> None:
    from app.services._approval_queue import counts, delete_intake, lifecycle, logging, projection

    assert hasattr(delete_intake, "assert_delete_request_allowed")
    assert hasattr(projection, "build_approval_read")
    assert hasattr(counts, "count_pending_approval_queue")
    assert hasattr(logging, "queue_logger")

    lifecycle_source = inspect.getsource(lifecycle)
    for module_name in ("counts", "delete_intake", "logging", "projection"):
        assert f"app.services._approval_queue.{module_name}" in lifecycle_source

    assert "app.api.v1.endpoints.approvals" not in lifecycle_source


def test_vendor_link_services_use_vendor_governance_modules() -> None:
    from app.services._vendor_governance import links, listing, reports
    from app.services._vendor_links import workflow

    assert hasattr(links, "VendorLinkAccessPlan")
    assert hasattr(links, "VendorLinkedResourceProjection")
    assert hasattr(listing, "VendorListingGovernance")
    assert hasattr(reports, "VendorReportDefinition")

    service_source = inspect.getsource(workflow)
    assert "app.api.v1.endpoints" not in service_source
    assert "from app.services._vendor_governance.links" in service_source


def test_deadline_services_use_deadline_execution_module() -> None:
    from app.services import issue_deadline_service, kri_deadline_service
    from app.services._deadline_execution import lifecycle

    assert hasattr(lifecycle, "DeadlineRunPlan")
    assert hasattr(lifecycle, "DeadlineNotificationPlan")
    assert hasattr(lifecycle, "DeadlineRunOutcome")

    service_source = inspect.getsource(issue_deadline_service) + inspect.getsource(kri_deadline_service)
    assert "from app.services._deadline_execution" in service_source
    assert "from app.services.deadline_notifications" not in service_source
    assert "from app.services.deadline_runner" not in service_source


def test_issue_workflow_routes_use_lifecycle_module() -> None:
    from app.api.v1.endpoints.issues import exceptions, workflow
    from app.api.v1.endpoints.issues.crud import update
    from app.services._issue_workflow import lifecycle

    assert hasattr(lifecycle, "IssueWorkflowOutcome")
    assert hasattr(lifecycle, "IssueUpdatePlan")
    assert hasattr(lifecycle, "IssueExceptionSelection")
    assert hasattr(lifecycle, "IssueOutboxPlan")

    route_source = inspect.getsource(update) + inspect.getsource(workflow) + inspect.getsource(exceptions)

    for lifecycle_function in (
        "update_issue_detail",
        "assign_issue_detail",
        "start_remediation_detail",
        "update_remediation_progress_detail",
        "close_issue_detail",
        "request_exception_detail",
        "approve_exception_detail",
        "revoke_exception_detail",
    ):
        assert lifecycle_function in route_source

    assert "OutboxService.enqueue" not in route_source


def test_issue_workflow_lifecycle_uses_service_owned_helpers() -> None:
    from app.services._issue_workflow import lifecycle, loading, outbox, serialization, source_validation

    assert hasattr(loading, "get_issue_with_relations")
    assert hasattr(loading, "get_writable_issue_or_404")
    assert hasattr(serialization, "serialize_refreshed_issue")
    assert hasattr(outbox, "enqueue_issue_outbox")
    assert hasattr(source_validation, "resolve_issue_source_metadata")

    lifecycle_source = inspect.getsource(lifecycle)
    for module_name in ("loading", "outbox", "serialization", "source_validation"):
        assert f"app.services._issue_workflow.{module_name}" in lifecycle_source

    assert "app.api.v1.endpoints.issues" not in lifecycle_source


def test_issue_workflow_lifecycle_no_longer_owns_update_source_mutation() -> None:
    assert "from app.services._issue_workflow.lifecycle import IssueWorkflowOutcome" not in _source(
        "backend/app/services/_issue_workflow/serialization.py"
    )

    lifecycle_source = _source("backend/app/services/_issue_workflow/lifecycle.py")
    for source_mutation_detail in (
        'if "source_type" in updates or "source_id" in updates:',
        "missing_source_id_for_concrete_switch",
        "clear_issue_source_links(",
        "ensure_issue_source_link(",
        "build_change_set(",
    ):
        assert source_mutation_detail not in lifecycle_source


def test_core_logging_and_scheduler_facades_do_not_own_split_implementations() -> None:
    logging_source = _source("backend/app/core/logging.py")
    for logging_detail in (
        "def _resolve_logging_config",
        "def _build_json_formatter",
        "def _build_console_handler",
        "def _build_file_handler",
    ):
        assert logging_detail not in logging_source

    scheduler_source = _source("backend/app/core/scheduler.py")
    for scheduler_detail in (
        "FULL_SCHEDULER_JOB_IDS =",
        "OPTIONAL_SCHEDULER_JOB_IDS =",
        "OUTBOX_ONLY_SCHEDULER_JOB_IDS =",
        "def _register_scheduler_jobs",
    ):
        assert scheduler_detail not in scheduler_source


def test_release_and_prod_readiness_modules_are_not_placeholder_markers() -> None:
    for relative_path in (
        "scripts/security/release_parity_audit/toolchain.py",
        "scripts/security/release_parity_audit/startup_preflight.py",
        "scripts/security/release_parity_audit/screenshots.py",
        "scripts/security/release_parity_audit/fingerprints.py",
        "scripts/security/release_parity_audit/cleanup.py",
        "scripts/security/release_parity_audit/facade.py",
    ):
        source = _source(relative_path)
        assert source.count("@dataclass") <= 2
        assert len(_defined_function_names(relative_path)) >= 1

    prod_script = _source("scripts/security/run_prod_readiness_audit_local.sh")
    assert "def score_phase" not in prod_script
    assert "matrix = json.loads(matrix_path.read_text" not in prod_script


def test_frontend_workflow_helpers_are_used_by_production_code() -> None:
    for export_name in (
        "nextEntityFormStep",
        "previousEntityFormStep",
        "resolveSubmitOutcome",
        "resetLinkPaginationOnSearch",
        "resolveLinkActionOutcome",
        "buildQuestionnaireComparisonModel",
        "buildOrphanResolutionLabel",
        "resolveOrphanStaleTarget",
    ):
        assert _production_frontend_import_count(export_name) >= 2


def test_notification_routes_use_inbox_module() -> None:
    from app.api.v1.endpoints import notifications
    from app.services._notification_inbox import lifecycle

    assert hasattr(lifecycle, "NotificationInboxPage")
    assert hasattr(lifecycle, "NotificationReadOutcome")
    assert hasattr(lifecycle, "NotificationPreferenceOutcome")
    assert hasattr(lifecycle, "NotificationInboxOptions")

    route_source = inspect.getsource(notifications)

    for inbox_function in (
        "list_notification_inbox",
        "count_notification_inbox_unread",
        "mark_notification_read",
        "mark_all_notifications_read",
        "read_notification_preferences",
        "update_notification_preferences",
    ):
        assert inbox_function in route_source

    assert "paginate_visible_notifications" not in route_source
    assert "count_visible_unread_notifications" not in route_source


def test_admin_console_routes_use_telemetry_composition_module() -> None:
    from app.api.v1.endpoints.admin import console
    from app.services._admin_telemetry import lifecycle

    assert hasattr(lifecycle, "SystemHealthSnapshot")
    assert hasattr(lifecycle, "SchedulerStatusSnapshot")
    assert hasattr(lifecycle, "OutboxStatusSnapshot")
    assert hasattr(lifecycle, "SystemStatsSnapshot")
    assert hasattr(lifecycle, "AdminOperationOutcome")

    route_source = inspect.getsource(console)

    for telemetry_function in (
        "build_system_health_snapshot",
        "build_scheduler_status_snapshot",
        "build_outbox_status_snapshot",
        "build_system_stats_snapshot",
        "revoke_admin_user_sessions",
    ):
        assert telemetry_function in route_source

    for route_owned_query in (
        "select(SchedulerJobRun)",
        "select(func.count()).select_from(OutboxEvent)",
        "revoke_user_sessions(",
    ):
        assert route_owned_query not in route_source
