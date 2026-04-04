"""Health check endpoint for monitoring and Docker health checks."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter()

class HealthResponse(BaseModel):
    """Health check response model."""
    status: str


@router.get("/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Health check endpoint for Docker health checks and monitoring.

    Returns:
        - status: 'healthy' if all systems operational
    """
    # Check database connectivity
    try:
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    # Overall status based on database connection
    status = "healthy" if db_status == "connected" else "degraded"

    return HealthResponse(status=status)
