from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.auth import AuthConfigResponse, AuthSsoConfig, DemoPersonaRead

router = APIRouter()

DEMO_PERSONAS: list[DemoPersonaRead] = [
    DemoPersonaRead.model_validate(persona)
    for persona in [
    {
        "section": "privileged",
        "name": "System Admin",
        "email": "admin@riskhub.local",
        "role_key": "auth:login_demo.roles.administrator",
        "color": "rose",
    },
    {
        "section": "privileged",
        "name": "Anna Kowalski",
        "email": "cro@riskhub.local",
        "role_key": "auth:login_demo.roles.chief_risk_officer",
        "color": "purple",
    },
    {
        "section": "privileged",
        "name": "Petra Svobodová",
        "email": "risk.manager@riskhub.local",
        "role_key": "auth:login_demo.roles.risk_manager",
        "color": "violet",
    },
    {
        "section": "department_heads",
        "name": "Eva Králová",
        "email": "ops.head@riskhub.local",
        "role_key": "auth:login_demo.roles.department_head",
        "dept_key": "auth:login_demo.departments.operations",
        "color": "amber",
    },
    {
        "section": "department_heads",
        "name": "Martin Procházka",
        "email": "fin.head@riskhub.local",
        "role_key": "auth:login_demo.roles.department_head",
        "dept_key": "auth:login_demo.departments.finance",
        "color": "emerald",
    },
    {
        "section": "department_heads",
        "name": "Tomáš Novotný",
        "email": "it.head@riskhub.local",
        "role_key": "auth:login_demo.roles.department_head",
        "dept_key": "auth:login_demo.departments.it",
        "color": "sky",
    },
    {
        "section": "employees",
        "name": "Jana Horáková",
        "email": "ops.analyst@riskhub.local",
        "role_key": "auth:login_demo.roles.control_owner",
        "dept_key": "auth:login_demo.departments.operations",
        "color": "amber",
    },
    {
        "section": "employees",
        "name": "Lukáš Dvořák",
        "email": "fin.analyst@riskhub.local",
        "role_key": "auth:login_demo.roles.control_owner",
        "dept_key": "auth:login_demo.departments.finance",
        "color": "emerald",
    },
    {
        "section": "employees",
        "name": "Barbora Němcová",
        "email": "it.analyst@riskhub.local",
        "role_key": "auth:login_demo.roles.control_owner",
        "dept_key": "auth:login_demo.departments.it",
        "color": "sky",
    },
    ]
]


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
        strict_capabilities=settings.strict_capabilities_enabled,
        sso=AuthSsoConfig(
            enabled=sso_enabled,
            tenant_id=tenant_id,
            client_id=client_id,
            authority=authority,
            scopes=["openid", "profile", "email"],
        ),
        sso_error=sso_error,
        demo_personas=DEMO_PERSONAS if demo_login_enabled else [],
    )
