from __future__ import annotations

import inspect


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


def test_auth_routes_use_session_outcome_module() -> None:
    from app.api.v1.endpoints.auth import refresh, sso
    from app.services._auth_session import outcomes

    assert hasattr(outcomes, "RefreshSessionOutcome")
    assert hasattr(outcomes, "SsoSessionOutcome")
    assert hasattr(outcomes, "SessionCookiePlan")
    assert hasattr(outcomes, "SessionAuditPlan")

    refresh_source = inspect.getsource(refresh)
    sso_source = inspect.getsource(sso)

    assert "refresh_session_context_outcome" in refresh_source
    assert "sso_session_outcome" in sso_source


def test_riskhub_config_routes_use_lifecycle_contracts() -> None:
    from app.api.v1.endpoints.riskhub import approval_scenarios, departments, risk_types, roles
    from app.services._riskhub_config import lifecycle

    assert hasattr(lifecycle, "ConfigEntityDefinition")
    assert hasattr(lifecycle, "ConfigLifecycleOutcome")
    assert hasattr(lifecycle, "ConfigAuditPlan")
    assert hasattr(lifecycle, "build_config_audit_plan")

    route_source = (
        inspect.getsource(roles)
        + inspect.getsource(departments)
        + inspect.getsource(risk_types)
        + inspect.getsource(approval_scenarios)
    )
    assert "build_config_audit_plan" in route_source


def test_quarterly_comparison_service_is_composition_facade() -> None:
    from app.services import quarterly_comparison_service
    from app.services._quarterly_comparison import composition

    assert hasattr(composition, "QuarterMetricComposition")
    assert hasattr(composition, "SnapshotSourceDecision")
    assert hasattr(composition, "MetricAvailability")
    assert quarterly_comparison_service.build_quarterly_comparison is composition.build_quarterly_comparison

    facade_source = inspect.getsource(quarterly_comparison_service)
    assert "async def build_quarterly_comparison" not in facade_source
