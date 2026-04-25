from sqlalchemy.ext.asyncio import AsyncSession

from .approvals import count_pending_approvals
from .kri import (
    calculate_kri_health,
    count_kri_breaches,
    count_overdue_kris,
    count_risks_without_kri,
)
from .orphaned import count_orphaned_items
from .risk_control import (
    calculate_control_coverage,
    count_active_risks,
    count_priority_risks,
)
from .vendors import count_active_vendors


async def capture_snapshot_metrics(
    db: AsyncSession,
    department_ids: list[int] | None = None,
) -> dict[str, int]:
    priority_count = await count_priority_risks(db, department_ids)
    kri_breaches = await count_kri_breaches(db, department_ids)
    pending_approvals = await count_pending_approvals(db, department_ids)
    control_coverage = await calculate_control_coverage(db, department_ids)
    orphaned_items = await count_orphaned_items(db, department_ids)
    kri_health = await calculate_kri_health(db, department_ids)
    overdue_kris = await count_overdue_kris(db, department_ids)
    risks_without_kri = await count_risks_without_kri(db, department_ids)
    active_risks = await count_active_risks(db, department_ids)
    active_vendors = await count_active_vendors(db, department_ids)

    return {
        "priority_risks": priority_count,
        "kri_breaches": kri_breaches,
        "pending_approvals": pending_approvals,
        "control_coverage": control_coverage,
        "orphaned_items": orphaned_items,
        "kri_health": kri_health,
        "overdue_kris": overdue_kris,
        "risks_without_kri": risks_without_kri,
        "active_risks": active_risks,
        "active_vendors": active_vendors,
    }
