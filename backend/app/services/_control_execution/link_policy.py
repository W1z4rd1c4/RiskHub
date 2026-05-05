from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Control, ControlRiskLink


@dataclass(frozen=True)
class ControlRiskLinkPlan:
    control_id: int
    risk_id: int
    effectiveness: str | None = None
    notes: str | None = None


async def load_link_for_control(db: AsyncSession, *, control_id: int, risk_id: int) -> ControlRiskLink:
    link = (
        await db.execute(
            select(ControlRiskLink)
            .where(ControlRiskLink.control_id == control_id)
            .where(ControlRiskLink.risk_id == risk_id)
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    return link


async def load_link_for_risk(db: AsyncSession, *, risk_id: int, control_id: int) -> ControlRiskLink:
    link = (
        await db.execute(
            select(ControlRiskLink)
            .where(ControlRiskLink.risk_id == risk_id)
            .where(ControlRiskLink.control_id == control_id)
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    return link


async def reload_link_for_control_response(db: AsyncSession, link_id: int) -> ControlRiskLink:
    return (
        await db.execute(
            select(ControlRiskLink)
            .options(
                selectinload(ControlRiskLink.risk),
                selectinload(ControlRiskLink.control).selectinload(Control.executions),
            )
            .where(ControlRiskLink.id == link_id)
        )
    ).scalar_one()


async def reload_link_for_risk_response(db: AsyncSession, link_id: int) -> ControlRiskLink:
    return (
        await db.execute(
            select(ControlRiskLink)
            .options(
                selectinload(ControlRiskLink.control).selectinload(Control.executions),
                selectinload(ControlRiskLink.risk),
            )
            .where(ControlRiskLink.id == link_id)
        )
    ).scalar_one()


async def assert_link_does_not_exist(db: AsyncSession, *, control_id: int, risk_id: int) -> None:
    existing = await db.execute(
        select(ControlRiskLink).where(ControlRiskLink.control_id == control_id).where(ControlRiskLink.risk_id == risk_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Link already exists")


async def create_control_risk_link_outcome(
    db: AsyncSession,
    *,
    control_id: int,
    risk_id: int,
    effectiveness: str,
    notes: str | None,
    response_owner: Literal["control", "risk"],
) -> ControlRiskLink:
    await assert_link_does_not_exist(db, control_id=control_id, risk_id=risk_id)
    link = ControlRiskLink(control_id=control_id, risk_id=risk_id, effectiveness=effectiveness, notes=notes)
    db.add(link)
    await db.commit()
    await db.refresh(link)
    if response_owner == "control":
        return await reload_link_for_control_response(db, link.id)
    return await reload_link_for_risk_response(db, link.id)


async def delete_control_risk_link_plan(db: AsyncSession, link: ControlRiskLink) -> None:
    await db.delete(link)
    await db.commit()
