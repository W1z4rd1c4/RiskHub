from pydantic import AliasChoices, Field

from app.core.config_sections import RedisSettingsSection


class RedisSettingsMixin:
    # Redis (required in production for multi-worker rate limiting and account lockout)
    redis_url: str | None = None
    redis_url_file: str | None = Field(
        default=None,
        validation_alias=AliasChoices("REDIS_URL_FILE", "redis_url_file"),
        exclude=True,
        repr=False,
    )
    rate_limit_limits: dict[str, tuple[int, int]] = Field(default_factory=dict)
    rate_limit_fail_closed_prefixes: list[str] = Field(
        default_factory=lambda: ["/api/v1/auth", "/api/v1/admin", "/api/v1/approvals"]
    )
    rate_limit_fail_closed_on_backend_error: bool = True
    lockout_fail_closed_on_backend_error: bool = True

    @property
    def redis(self) -> RedisSettingsSection:
        return RedisSettingsSection(
            redis_url=self.redis_url,
            rate_limit_limits={key: tuple(value) for key, value in self.rate_limit_limits.items()},
            rate_limit_fail_closed_prefixes=tuple(self.rate_limit_fail_closed_prefixes),
            rate_limit_fail_closed_on_backend_error=self.rate_limit_fail_closed_on_backend_error,
            lockout_fail_closed_on_backend_error=self.lockout_fail_closed_on_backend_error,
        )

    @property
    def redis_settings(self) -> RedisSettingsSection:
        return self.redis
