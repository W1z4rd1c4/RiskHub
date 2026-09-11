"""Native authentication context on the existing RiskHub token/refresh lineage."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.config import Settings
from app.core.datetime_utils import utc_now
from app.core.production_contract import LOCAL_FULL_AUTH_MAX_SECONDS


@dataclass(frozen=True)
class LocalSessionContext:
    authenticated_at: datetime
    expires_at: datetime
    factor_generation: str | None
    installation_id: str

    @property
    def auth_method(self) -> str:
        return "local_mfa" if self.factor_generation is not None else "local_password"

    def claims(self) -> dict[str, str | int | None]:
        return {
            "auth_method": self.auth_method,
            "auth_time": int(self.authenticated_at.timestamp()),
            "session_exp": int(self.expires_at.timestamp()),
            "factor_generation": self.factor_generation,
            "installation_id": self.installation_id,
        }

    @classmethod
    def from_claims(cls, payload: dict) -> "LocalSessionContext":
        issued, expires = payload.get("auth_time"), payload.get("session_exp")
        generation, installation = payload.get("factor_generation"), payload.get("installation_id")
        method = payload.get("auth_method")
        valid_method = (
            method == "local_mfa" and isinstance(generation, str) and len(generation) == 32
        ) or (method == "local_password" and "factor_generation" in payload and generation is None)
        if (
            not valid_method
            or type(issued) is not int
            or type(expires) is not int
            or not isinstance(installation, str)
            or len(installation) != 36
        ):
            raise ValueError("Missing native authentication context")
        now = int(utc_now().timestamp())
        if (
            not 0 <= issued <= now + 30
            or not issued < expires <= issued + LOCAL_FULL_AUTH_MAX_SECONDS
            or expires <= now
        ):
            raise ValueError("Native authentication expired")
        if type(payload.get("exp")) is not int or payload["exp"] > expires:
            raise ValueError("Token exceeds native authentication lifetime")
        return cls(datetime.fromtimestamp(issued, UTC), datetime.fromtimestamp(expires, UTC), generation, installation)

    @classmethod
    def completed(cls, *, factor_generation: str | None, installation_id: str) -> "LocalSessionContext":
        now = utc_now()
        return cls(now, now + timedelta(seconds=LOCAL_FULL_AUTH_MAX_SECONDS), factor_generation, installation_id)


def native_identity_selected(settings: Settings) -> bool:
    return settings.auth_mode == "password" and settings.directory_provider == "none"
