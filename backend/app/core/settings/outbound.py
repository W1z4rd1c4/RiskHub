from pydantic import Field

from app.core.config_sections import OutboundSettingsSection


class OutboundSettingsMixin:
    # Outbound call hardening
    outbound_allow_private_destinations: bool = False
    outbound_allowed_hosts: list[str] = Field(default_factory=list)
    outbound_block_redirects: bool = True

    @property
    def outbound(self) -> OutboundSettingsSection:
        return OutboundSettingsSection(
            allow_private_destinations=self.outbound_allow_private_destinations,
            allowed_hosts=tuple(self.outbound_allowed_hosts),
            block_redirects=self.outbound_block_redirects,
        )

    @property
    def outbound_settings(self) -> OutboundSettingsSection:
        return self.outbound
