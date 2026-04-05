from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings


def register_middleware(app: FastAPI, settings: Settings) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if not settings.debug:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)

    from app.middleware.logging_context import LoggingContextMiddleware
    from app.middleware.language import LanguageMiddleware
    from app.middleware.security import ProtocolGuardMiddleware, RateLimitMiddleware, SecurityHeadersMiddleware

    app.add_middleware(LoggingContextMiddleware, trusted_proxies=settings.trusted_proxies)
    app.add_middleware(SecurityHeadersMiddleware, enable_hsts=not settings.debug)
    app.add_middleware(ProtocolGuardMiddleware)
    app.add_middleware(
        RateLimitMiddleware,
        enabled=not settings.debug,
        trusted_proxies=settings.trusted_proxies,
    )
    app.add_middleware(LanguageMiddleware)


def register_routes(app: FastAPI, settings: Settings) -> None:
    app.include_router(api_router, prefix="/api/v1")

    @app.get("/")
    async def root():
        base = {"name": settings.app_name, "version": settings.app_version}
        if settings.debug:
            base["docs"] = "/docs"
        return base


def configure_app_dependencies(app: FastAPI, settings: Settings) -> None:
    def _app_settings_override() -> Settings:
        return settings

    app.dependency_overrides[get_settings] = _app_settings_override
