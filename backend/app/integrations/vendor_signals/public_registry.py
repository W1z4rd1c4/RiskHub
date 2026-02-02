from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings
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
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base_url.rstrip('/')}/company",
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

