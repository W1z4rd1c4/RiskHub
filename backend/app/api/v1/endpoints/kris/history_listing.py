from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import KeyRiskIndicator, User
from app.schemas.kri import KRIHistoryCapabilitiesRead, KRIHistoryEntry, KRIHistoryListResponse
from app.services._kri_history.workflow import history_capabilities
from app.services.kri_history_service import KRIHistoryService


async def build_kri_history_response(
    db: AsyncSession,
    *,
    kri: KeyRiskIndicator,
    kri_id: int,
    current_user: User,
    from_date: date | None,
    to_date: date | None,
    offset: int,
    limit: int,
    sort_by: str,
    sort_direction: str,
) -> KRIHistoryListResponse:
    entries, total = await KRIHistoryService.get_history(
        db=db,
        kri_id=kri_id,
        from_date=from_date,
        to_date=to_date,
        offset=offset,
        limit=limit,
        sort_by=sort_by,
        sort_direction=sort_direction,
    )

    items = []
    for entry in entries:
        item = KRIHistoryEntry.model_validate(entry)
        if entry.recorded_by:
            item.recorded_by_name = entry.recorded_by.name
        items.append(item)

    return KRIHistoryListResponse(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
        capabilities=KRIHistoryCapabilitiesRead(**await history_capabilities(db, current_user, kri)),
    )
