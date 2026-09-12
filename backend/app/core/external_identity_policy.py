"""Selected-profile admission for external identity work, separate from local user lookup."""

from app.core.config import Settings
from app.core.exceptions import AuthorizationError


def external_directory_enabled(settings: Settings) -> bool:
    return settings.directory_provider != "none"


def require_external_directory(settings: Settings) -> None:
    if not external_directory_enabled(settings):
        raise AuthorizationError("External directory is disabled", code="DIRECTORY_DISABLED")


def sso_enabled(settings: Settings) -> bool:
    return settings.auth_mode in ("microsoft_sso", "hybrid_dev") and external_directory_enabled(settings)


def require_sso(settings: Settings) -> None:
    if not sso_enabled(settings):
        raise AuthorizationError("This authentication method is disabled", code="AUTH_METHOD_DISABLED")
