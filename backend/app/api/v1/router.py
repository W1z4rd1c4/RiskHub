from fastapi import APIRouter
from app.api.v1.endpoints import health, users, controls, risks, dashboard

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(controls.router, prefix="/controls", tags=["controls"])
api_router.include_router(risks.router, prefix="/risks", tags=["risks"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])


