"""API router combining all endpoints."""
from fastapi import APIRouter

from app.api.endpoints import health, users

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
