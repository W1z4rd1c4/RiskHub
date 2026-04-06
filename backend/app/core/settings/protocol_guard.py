from pydantic import Field

from app.core.config_sections import ProtocolGuardSettingsSection


class ProtocolGuardSettingsMixin:
    # Request protocol hardening
    protocol_guard_enabled: bool = True
    protocol_guard_block_method_override: bool = True
    protocol_guard_sensitive_query_keys: list[str] = Field(
        default_factory=lambda: ["department_id", "skip", "limit", "format", "user_id", "role_id"]
    )
    protocol_guard_json_prefixes: list[str] = Field(
        default_factory=lambda: ["/api/v1/auth", "/api/v1/admin", "/api/v1/approvals"]
    )

    @property
    def protocol_guard(self) -> ProtocolGuardSettingsSection:
        return ProtocolGuardSettingsSection(
            enabled=self.protocol_guard_enabled,
            block_method_override=self.protocol_guard_block_method_override,
            sensitive_query_keys=tuple(self.protocol_guard_sensitive_query_keys),
            json_prefixes=tuple(self.protocol_guard_json_prefixes),
        )

    @property
    def protocol_guard_settings(self) -> ProtocolGuardSettingsSection:
        return self.protocol_guard
