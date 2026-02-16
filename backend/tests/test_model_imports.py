"""Regression test for model imports.

Ensures that all models can be imported without runtime errors.
This catches import-order bugs (e.g., referencing symbols before they are imported).
"""


def test_app_models_imports():
    """Verify app.models package imports without error."""
    import app.models  # noqa: F401


def test_approval_request_imports():
    """Verify ApprovalRequest model imports without error.
    
    Regression test for UTC import order bug where datetime.now(UTC)
    was used before UTC was imported.
    """
    from app.models.approval_request import ApprovalRequest  # noqa: F401


def test_all_model_classes_accessible():
    """Verify all model classes are accessible from app.models."""
    from app.models import (
        Role, Permission, RolePermission, RoleType,
        User,
        Department,
        Control, ControlForm, ControlFrequency, ControlStatus,
        ControlExecution, ExecutionResult,
        Risk, ControlRiskLink, RiskType, RiskStatus, ControlEffectiveness,
        KeyRiskIndicator, KRIFrequency,
        KRIValueHistory,
        ApprovalRequest, ApprovalStatus, ApprovalResourceType, ApprovalActionType,
        Notification, NotificationType,
        OrphanedItem,
        ActivityLog, ActivityAction, ActivityEntityType,
        RiskTypeConfig,
        GlobalConfig,
        ApprovalScenario,
        QuarterlyMetricSnapshot, SnapshotType,
    )
    # If we get here, all imports succeeded
    assert ApprovalRequest is not None
