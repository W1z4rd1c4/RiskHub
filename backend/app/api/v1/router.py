from fastapi import APIRouter

from app.api.v1.endpoints import health, auth, users, controls, risks, dashboard, departments, reports, executions, kris, approvals, notifications, admin

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(controls.router, prefix="/controls", tags=["controls"])
api_router.include_router(risks.router, prefix="/risks", tags=["risks"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(departments.router, prefix="/departments", tags=["departments"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(executions.router, prefix="/executions", tags=["executions"])
api_router.include_router(kris.router)
api_router.include_router(approvals.router, prefix="/approvals", tags=["approvals"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])





