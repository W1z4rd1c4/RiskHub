from __future__ import annotations

from fastapi import status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import log_activity
from app.core.config import Settings
from app.models.activity_log import ActivityAction, ActivityEntityType
from app.schemas.auth import SsoExchangeRequest
from app.services.sso_token_service import (
    SsoProviderUnavailableError,
    SsoTokenVerificationError,
    verify_entra_id_token,
)


async def log_failed_sso(
    db: AsyncSession,
    *,
    entity_name: str,
    description: str,
) -> None:
    await log_activity(
        db=db,
        actor=None,
        action=ActivityAction.FAILED_LOGIN,
        entity_type=ActivityEntityType.USER,
        entity_id=0,
        entity_name=entity_name,
        safe_description=description,
        safe_description_siem=description,
        description=description,
    )
    await db.commit()


async def verify_sso_identity(
    *,
    payload: SsoExchangeRequest,
    settings: Settings,
    db: AsyncSession,
    identity_verifier=verify_entra_id_token,
):
    try:
        identity = await identity_verifier(id_token=payload.id_token, settings=settings)
    except SsoProviderUnavailableError:
        await log_failed_sso(
            db,
            entity_name="sso",
            description="Failed SSO login: verification unavailable",
        )
        return None, JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "detail": "SSO verification unavailable. Please try again later.",
                "code": "SSO_DISCOVERY_FAILED",
            },
        )
    except SsoTokenVerificationError as e:
        await log_failed_sso(
            db,
            entity_name="sso",
            description=f"Failed SSO login: {e.code}",
        )
        status_code_value = status.HTTP_401_UNAUTHORIZED
        code = "SSO_TOKEN_INVALID"
        if e.code == "tenant_mismatch":
            code = "SSO_TENANT_MISMATCH"
        elif e.code == "email_domain_not_allowed":
            status_code_value = status.HTTP_403_FORBIDDEN
            code = "SSO_EMAIL_DOMAIN_FORBIDDEN"
        elif e.code == "email_required":
            status_code_value = status.HTTP_400_BAD_REQUEST
            code = "SSO_EMAIL_MISSING"
        elif e.code == "missing_token":
            status_code_value = status.HTTP_400_BAD_REQUEST
            code = "SSO_TOKEN_INVALID"
        return None, JSONResponse(status_code=status_code_value, content={"detail": "Invalid SSO token", "code": code})

    return identity, None


_log_failed_sso = log_failed_sso
