from fastapi import APIRouter

from app.api.v1.endpoints import (
    access,
    activity_log,
    admin,
    approvals,
    auth,
    controls,
    dashboard,
    departments,
    directory,
    executions,
    health,
    issues,
    kris,
    lookups,
    notifications,
    orphaned_items,
    preferences,
    reports,
    risk_questionnaires,
    riskhub,
    riskhub_questionnaires,
    risks,
    users,
    vendor_assessments,
    vendor_contract_controls,
    vendor_dependencies,
    vendor_incidents,
    vendor_links,
    vendor_reports,
    vendor_resilience,
    vendor_risk_factors,
    vendor_signals,
    vendor_slas,
    vendors,
)

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(access.router, prefix="/access", tags=["access"])
api_router.include_router(controls.router, prefix="/controls", tags=["controls"])
api_router.include_router(risks.router, prefix="/risks", tags=["risks"])
api_router.include_router(issues.router, tags=["issues"])
api_router.include_router(vendors.router, prefix="/vendors", tags=["vendors"])
api_router.include_router(vendor_risk_factors.router, tags=["vendor-risk-factors"])
api_router.include_router(vendor_links.router, tags=["vendor-links"])
api_router.include_router(vendor_assessments.router, tags=["vendor-assessments"])
api_router.include_router(vendor_contract_controls.router, tags=["vendor-contract-controls"])
api_router.include_router(vendor_resilience.router, tags=["vendor-resilience"])
api_router.include_router(vendor_dependencies.router, tags=["vendor-dependencies"])
api_router.include_router(vendor_incidents.router, tags=["vendor-incidents"])
api_router.include_router(vendor_slas.router, tags=["vendor-slas"])
api_router.include_router(vendor_reports.router, tags=["vendor-reports"])
api_router.include_router(vendor_signals.router, tags=["vendor-signals"])
api_router.include_router(risk_questionnaires.risk_router, tags=["questionnaires"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(departments.router, prefix="/departments", tags=["departments"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(executions.router, prefix="/executions", tags=["executions"])
api_router.include_router(kris.router)
api_router.include_router(approvals.router, prefix="/approvals", tags=["approvals"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(directory.router, prefix="/directory", tags=["directory"])
api_router.include_router(orphaned_items.router, prefix="/orphaned-items", tags=["governance"])
api_router.include_router(lookups.router, prefix="/lookups", tags=["lookups"])
api_router.include_router(activity_log.router, prefix="/activity-log", tags=["activity-log"])
api_router.include_router(riskhub.router, prefix="/riskhub", tags=["riskhub"])
api_router.include_router(riskhub_questionnaires.router)
api_router.include_router(preferences.router)
api_router.include_router(risk_questionnaires.router, tags=["questionnaires"])
