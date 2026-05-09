"""Health/readiness/liveness response schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class LivenessResponse(BaseModel):
    """Process liveness response model."""

    status: Literal["alive"]


class ReadinessResponse(BaseModel):
    """Readiness response model."""

    ready: bool
    database: Literal["connected", "disconnected"]
    redis: Literal["connected", "disconnected", "disabled"]
    scheduler_role: Literal["disabled", "leader", "follower"]
    scheduler_status: Literal["disabled", "leader_running", "follower_ready", "error"]


class HealthResponse(ReadinessResponse):
    """Diagnostic health response model."""

    status: Literal["healthy", "degraded"]
