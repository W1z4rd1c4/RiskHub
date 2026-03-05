"""Vendor SLA deadline and breach checking service for generating notifications."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.role import RoleType
from app.models.vendor_sla import VendorSLA
from app.services.vendor_sla_deadline_support import (
    build_vendor_sla_deadline_context,
    collect_owner_ids,
    initialize_results,
    list_active_slas,
    list_governance_recipients,
    load_owners_by_id,
    load_vendor_sla_config,
)
from app.services.vendor_sla_notification_policy import (
    process_breach_notifications,
    process_due_notifications,
)

logger = logging.getLogger(__name__)


class VendorSLADeadlineService:
    @staticmethod
    async def _load_governance_recipients(db: AsyncSession) -> list[User]:
        return await list_governance_recipients(db, {RoleType.RISK_MANAGER, RoleType.COMPLIANCE})

    @staticmethod
    async def _process_single_sla(
        db: AsyncSession,
        *,
        sla: VendorSLA,
        today: date,
        now: datetime,
        config: dict,
        governance_recipients: list[User],
        owners_by_id: dict[int, User],
        visibility_cache: dict[tuple[int, int], bool],
        results: dict[str, int],
    ) -> None:
        context = build_vendor_sla_deadline_context(sla, today=today, owners_by_id=owners_by_id)
        if context is None:
            return

        await process_due_notifications(
            db,
            sla=sla,
            context=context,
            today=today,
            config=config,
            now=now,
            visibility_cache=visibility_cache,
            results=results,
        )
        await process_breach_notifications(
            db,
            sla=sla,
            context=context,
            governance_recipients=governance_recipients,
            owners_by_id=owners_by_id,
            config=config,
            now=now,
            visibility_cache=visibility_cache,
            results=results,
        )

    @staticmethod
    async def _process_slas(
        db: AsyncSession,
        *,
        slas: list[VendorSLA],
        today: date,
        now: datetime,
        config: dict,
        governance_recipients: list[User],
        owners_by_id: dict[int, User],
        visibility_cache: dict[tuple[int, int], bool],
        results: dict[str, int],
    ) -> None:
        for sla in slas:
            try:
                await VendorSLADeadlineService._process_single_sla(
                    db,
                    sla=sla,
                    today=today,
                    now=now,
                    config=config,
                    governance_recipients=governance_recipients,
                    owners_by_id=owners_by_id,
                    visibility_cache=visibility_cache,
                    results=results,
                )
            except Exception:
                logger.exception("Error checking vendor SLA %s", getattr(sla, "id", None))

    @staticmethod
    async def check_vendor_sla_deadlines(db: AsyncSession, *, now: datetime | None = None) -> dict[str, int]:
        now = now or datetime.now(UTC)
        today = now.date()

        config = await load_vendor_sla_config(db)
        results = initialize_results()
        slas = await list_active_slas(db)
        results["total_checked"] = len(slas)

        governance_recipients = await VendorSLADeadlineService._load_governance_recipients(db)
        visibility_cache: dict[tuple[int, int], bool] = {}
        owners_by_id = await load_owners_by_id(db, collect_owner_ids(slas))

        await VendorSLADeadlineService._process_slas(
            db,
            slas=slas,
            today=today,
            now=now,
            config=config,
            governance_recipients=governance_recipients,
            owners_by_id=owners_by_id,
            visibility_cache=visibility_cache,
            results=results,
        )

        await db.commit()
        return results
