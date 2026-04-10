async def is_kri_reporting_owner(db, user_id: int, kri_id: int) -> bool:
    """
    Check if user is the reporting owner of a specific KRI.

    Used for granting cross-department access to assigned reporting owners.
    """
    from sqlalchemy import select

    from app.models import KeyRiskIndicator

    result = await db.execute(select(KeyRiskIndicator.reporting_owner_id).where(KeyRiskIndicator.id == kri_id))
    reporting_owner_id = result.scalar_one_or_none()
    return reporting_owner_id == user_id


async def is_risk_kri_reporting_owner(db, user_id: int, risk_id: int) -> bool:
    """
    Check if user is the reporting owner of any KRI linked to a specific Risk.

    Used for granting ownership-based cross-department risk scope, including
    read flows and related workflow mutations where the endpoint separately
    enforces write permission and target-side access.
    """
    from sqlalchemy import select

    from app.models import KeyRiskIndicator

    result = await db.execute(
        select(KeyRiskIndicator.id)
        .where(
            KeyRiskIndicator.risk_id == risk_id,
            KeyRiskIndicator.reporting_owner_id == user_id,
            KeyRiskIndicator.is_archived.is_(False),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def get_kri_ids_where_reporting_owner(db, user_id: int) -> list[int]:
    """
    Get list of KRI IDs where user is the reporting owner.

    Used for including cross-department KRIs in list queries.
    """
    from sqlalchemy import select

    from app.models import KeyRiskIndicator

    result = await db.execute(select(KeyRiskIndicator.id).where(KeyRiskIndicator.reporting_owner_id == user_id))
    return [row[0] for row in result.all()]


async def get_risk_ids_where_kri_reporting_owner(db, user_id: int) -> list[int]:
    """
    Get list of Risk IDs where user is reporting owner of any linked KRI.

    Used for including cross-department risks in list queries.
    """
    from sqlalchemy import select

    from app.models import KeyRiskIndicator

    result = await db.execute(
        select(KeyRiskIndicator.risk_id)
        .where(
            KeyRiskIndicator.reporting_owner_id == user_id,
            KeyRiskIndicator.is_archived.is_(False),
        )
        .distinct()
    )
    return [row[0] for row in result.all()]


async def is_control_owner(db, user_id: int, control_id: int) -> bool:
    """
    Check if user is the owner of a specific Control.

    Used for granting cross-department access to assigned control owners.
    """
    from sqlalchemy import select

    from app.models import Control

    result = await db.execute(select(Control.control_owner_id).where(Control.id == control_id))
    control_owner_id = result.scalar_one_or_none()
    return control_owner_id == user_id


async def is_risk_control_owner(db, user_id: int, risk_id: int) -> bool:
    """
    Check if user is the owner of any Control linked to a specific Risk.

    Used for granting ownership-based cross-department risk scope, including
    read flows and related workflow mutations where the endpoint separately
    enforces write permission and target-side access.
    """
    from sqlalchemy import select

    from app.models import Control, ControlRiskLink

    result = await db.execute(
        select(Control.id)
        .join(ControlRiskLink, Control.id == ControlRiskLink.control_id)
        .where(ControlRiskLink.risk_id == risk_id, Control.control_owner_id == user_id)
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def get_control_ids_where_owner(db, user_id: int) -> list[int]:
    """
    Get list of Control IDs where user is the control owner.

    Used for including cross-department controls in list queries.
    """
    from sqlalchemy import select

    from app.models import Control

    result = await db.execute(select(Control.id).where(Control.control_owner_id == user_id))
    return [row[0] for row in result.all()]


async def get_risk_ids_where_control_owner(db, user_id: int) -> list[int]:
    """
    Get list of Risk IDs where user is owner of any linked Control.

    Used for including cross-department risks in list queries.
    """
    from sqlalchemy import select

    from app.models import Control, ControlRiskLink

    result = await db.execute(
        select(ControlRiskLink.risk_id)
        .join(Control, Control.id == ControlRiskLink.control_id)
        .where(Control.control_owner_id == user_id)
        .distinct()
    )
    return [row[0] for row in result.all()]
