from typing import Literal

from app.core.config_sections import SessionSettingsSection


class SessionSettingsMixin:
    # Session/refresh-token behavior
    refresh_token_expire_days: int = 7
    refresh_cookie_name: str = "riskhub_refresh_token"
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    refresh_cookie_domain: str | None = None
    refresh_token_migration_grace: bool = True

    @property
    def session(self) -> SessionSettingsSection:
        return SessionSettingsSection(
            refresh_token_expire_days=self.refresh_token_expire_days,
            refresh_cookie_name=self.refresh_cookie_name,
            refresh_cookie_samesite=self.refresh_cookie_samesite,
            refresh_cookie_domain=self.refresh_cookie_domain,
            refresh_token_migration_grace=self.refresh_token_migration_grace,
        )

    @property
    def session_settings(self) -> SessionSettingsSection:
        return self.session
