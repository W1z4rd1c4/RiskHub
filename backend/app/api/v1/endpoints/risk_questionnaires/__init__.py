"""Risk questionnaire API endpoints."""

from fastapi import APIRouter

from . import clarifications, inbox, questionnaire, risk_routes

router = APIRouter(prefix="/questionnaires")
risk_router = APIRouter(prefix="/risks")

risk_router.include_router(risk_routes.router)
router.include_router(inbox.router)
router.include_router(questionnaire.router)
router.include_router(clarifications.router)

__all__ = ["router", "risk_router"]

