from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.integrations.vendor_signals.public_registry import PublicRegistryConnector
from app.models.vendor import Vendor
from app.models.vendor_external_signal import VendorExternalSignal, VendorExternalSignalStatus

logger = logging.getLogger(__name__)


class VendorSignalService:
    @staticmethod
    def connectors():
        return [PublicRegistryConnector()]

    @staticmethod
    def min_interval_hours() -> int:
        settings = get_settings()
        return max(settings.vendor_signals_min_interval_hours, 0)

    @staticmethod
    async def _latest_fetched_at(db: AsyncSession, *, vendor_id: int, provider_key: str) -> datetime | None:
        stmt = (
            select(VendorExternalSignal.fetched_at)
            .where(VendorExternalSignal.vendor_id == vendor_id)
            .where(VendorExternalSignal.provider_key == provider_key)
            .order_by(desc(VendorExternalSignal.fetched_at))
            .limit(1)
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def refresh_vendor_signals(
        db: AsyncSession,
        *,
        vendor: Vendor,
        force: bool = False,
        fetched_at: datetime | None = None,
    ) -> list[VendorExternalSignal]:
        fetched_at = fetched_at or datetime.now(UTC)
        results: list[VendorExternalSignal] = []

        for connector in VendorSignalService.connectors():
            if not connector.supports(vendor):
                continue

            if not force:
                latest = await VendorSignalService._latest_fetched_at(
                    db, vendor_id=vendor.id, provider_key=connector.provider_key
                )
                if latest:
                    latest_utc = latest.replace(tzinfo=UTC) if latest.tzinfo is None else latest.astimezone(UTC)
                    if latest_utc >= (fetched_at - timedelta(hours=VendorSignalService.min_interval_hours())):
                        continue

            try:
                signals = await connector.fetch(vendor)
                for s in signals:
                    entry = VendorExternalSignal(
                        vendor_id=vendor.id,
                        provider_key=s.provider_key,
                        signal_type=s.signal_type,
                        payload_json=s.payload,
                        fetched_at=fetched_at,
                        status=VendorExternalSignalStatus.ok,
                        error_message=None,
                    )
                    db.add(entry)
                    results.append(entry)
            except Exception as e:
                logger.warning(
                    f"Vendor signal fetch failed (vendor_id={vendor.id}, provider={connector.provider_key}): {e}"
                )
                entry = VendorExternalSignal(
                    vendor_id=vendor.id,
                    provider_key=connector.provider_key,
                    signal_type="error",
                    payload_json={"vendor_id": vendor.id, "provider_key": connector.provider_key},
                    fetched_at=fetched_at,
                    status=VendorExternalSignalStatus.error,
                    error_message=str(e),
                )
                db.add(entry)
                results.append(entry)

        await db.commit()
        return results
