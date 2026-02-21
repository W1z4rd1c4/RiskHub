from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.outbound_guard import OutboundRequestError, build_outbound_client, extract_host, guard_outbound_url
from app.integrations.vendor_signals.base import VendorSignalConnector, VendorSignalResult
from app.models.vendor import Vendor

logger = logging.getLogger(__name__)


class PublicRegistryConnector(VendorSignalConnector):
    provider_key = "public_registry"

    def supports(self, vendor: Vendor) -> bool:
        return bool(getattr(vendor, "registration_id", None))

    async def fetch(self, vendor: Vendor) -> list[VendorSignalResult]:
        settings = get_settings()
        base_url = getattr(settings, "vendor_signals_public_registry_base_url", None)
        if not base_url:
            raise RuntimeError("Public registry connector not configured")

        registration_id = vendor.registration_id
        target_url = f"{base_url.rstrip('/')}/company"
        try:
            guard_outbound_url(
                url=target_url,
                settings=settings,
                allowed_hosts=([extract_host(base_url)] if extract_host(base_url) else None),
            )
        except OutboundRequestError as exc:
            raise RuntimeError(str(exc)) from exc

        async with build_outbound_client(settings=settings, timeout_seconds=10.0) as client:
            resp = await client.get(
                target_url,
                params={"registration_id": registration_id},
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()

        payload = {
            "registration_id": registration_id,
            "company_status": data.get("status"),
            "registered_address": data.get("address"),
            "filings_url": data.get("filings_url") or data.get("url"),
            "raw": data,
        }
        return [
            VendorSignalResult(
                provider_key=self.provider_key,
                signal_type="company_profile",
                payload=payload,
            )
        ]
