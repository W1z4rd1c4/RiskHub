from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.auth import AuthConfigResponse

router = APIRouter()


@router.get("/config", response_model=AuthConfigResponse)
async def get_auth_config(settings: Settings = Depends(get_settings)) -> AuthConfigResponse:
    tenant_id = settings.entra_tenant_id or None
    client_id = settings.entra_client_id or None
    demo_login_enabled = bool(settings.debug and settings.mock_auth_enabled and settings.auth_mode == "hybrid_dev")
    password_login_enabled = settings.auth_mode in ("password", "hybrid_dev")

    sso_intended = settings.auth_mode in ("microsoft_sso", "hybrid_dev")
    sso_configured = bool(tenant_id and client_id)
    sso_enabled = bool(sso_intended and sso_configured)
    authority = f"https://login.microsoftonline.com/{tenant_id}" if sso_enabled else None
    sso_error = None
    if sso_intended and not sso_configured:
        sso_error = "SSO enabled by AUTH_MODE but missing ENTRA_TENANT_ID/ENTRA_CLIENT_ID"
    return AuthConfigResponse(
        auth_mode=settings.auth_mode,
        demo_login_enabled=demo_login_enabled,
        password_login_enabled=password_login_enabled,
        sso={
            "enabled": sso_enabled,
            "tenant_id": tenant_id,
            "client_id": client_id,
            "authority": authority,
            "scopes": ["openid", "profile", "email"],
        },
        sso_error=sso_error,
    )
