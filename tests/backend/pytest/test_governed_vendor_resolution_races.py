"""PostgreSQL serialization contracts for governed Vendor resolution (#87)."""

from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import ApprovalScenario, GlobalConfig, User
from app.models.user import AccessScope


@pytest.mark.postgres
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "race_target",
    ["requester_role", "resolver_scope", "workbook_parameter", "scenario"],
)
async def test_postgres_vendor_resolution_serializes_authoritative_decision_inputs(
    race_target: str,
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_cro: User,
    test_user_risk_manager: User,
    test_user_employee: User,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL decision-input row locks are authoritative")

    from app.db.seed import seed_ict_workbook_parameter_config
    from app.services._governed_mutations import vendor_resolution

    await seed_ict_workbook_parameter_config(db_session)
    db_session.add(
        ApprovalScenario(
            key="protected_vendor_edit",
            display_name="Protected Vendor mutations",
            description="Independent approval for protected Vendor mutations",
            requires_approval=True,
            approver_roles=["risk_manager", "cro"],
        )
    )
    await db_session.commit()

    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post(
            "/api/v1/vendors",
            json={
                "name": f"Vendor decision race {race_target}",
                "process": "Operations",
                "outsourcing_owner_user_id": test_user_cro.id,
                "department_id": test_user_cro.department_id,
                "replaceability": "not_substitutable",
                "request_reason": "Serialize authoritative decision inputs",
            },
        )
    assert submitted.status_code == 202, submitted.text

    decision_locked = asyncio.Event()
    release_resolution = asyncio.Event()
    original_live_policy = vendor_resolution._live_policy

    async def paused_live_policy(*args, **kwargs):
        result = await original_live_policy(*args, **kwargs)
        decision_locked.set()
        await release_resolution.wait()
        return result

    monkeypatch.setattr(vendor_resolution, "_live_policy", paused_live_policy)
    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def independent_db_session():
        async with session_maker() as session:
            await session.execute(text("SET LOCAL lock_timeout = '3s'"))
            yield session

    async def mutate_decision_input() -> None:
        async with session_maker() as session:
            await session.execute(text("SET LOCAL lock_timeout = '3s'"))
            if race_target == "requester_role":
                await session.execute(
                    update(User)
                    .where(User.id == test_user_cro.id)
                    .values(role_id=test_user_employee.role_id)
                )
            elif race_target == "resolver_scope":
                await session.execute(
                    update(User)
                    .where(User.id == test_user_risk_manager.id)
                    .values(access_scope=AccessScope.DEPARTMENT)
                )
            elif race_target == "workbook_parameter":
                parameter_id = await session.scalar(
                    select(GlobalConfig.id).where(
                        GlobalConfig.key == "ict_register_verze"
                    )
                )
                assert parameter_id is not None
                await session.execute(
                    update(GlobalConfig)
                    .where(GlobalConfig.id == parameter_id)
                    .values(value="concurrent-version")
                )
            else:
                await session.execute(
                    update(ApprovalScenario)
                    .where(ApprovalScenario.key == "protected_vendor_edit")
                    .values(requires_approval=False)
                )
            await session.commit()

    async with client_factory(
        user=test_user_risk_manager,
        db_override=independent_db_session,
    ) as approver:
        resolving = asyncio.create_task(
            approver.post(
                f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
                json={"resolution_notes": f"Serialize {race_target}"},
            )
        )
        await asyncio.wait_for(decision_locked.wait(), timeout=5)
        racing_update = asyncio.create_task(mutate_decision_input())
        await asyncio.sleep(0.15)
        assert not racing_update.done()
        release_resolution.set()
        resolved, _ = await asyncio.wait_for(
            asyncio.gather(resolving, racing_update),
            timeout=10,
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "approved"


@pytest.mark.postgres
@pytest.mark.asyncio
async def test_postgres_same_name_vendor_submit_waits_behind_creation_resolution(
    client_factory,
    db_session: AsyncSession,
    async_engine,
    monkeypatch,
    test_user_cro: User,
    test_user_risk_manager: User,
) -> None:
    if db_session.bind.dialect.name != "postgresql":
        pytest.skip("PostgreSQL advisory-lock ordering is authoritative")

    from app.db.seed import seed_ict_workbook_parameter_config
    from app.services._governed_mutations import (
        vendor_mutations,
        vendor_resolution,
    )

    await seed_ict_workbook_parameter_config(db_session)
    db_session.add(
        ApprovalScenario(
            key="protected_vendor_edit",
            display_name="Protected Vendor mutations",
            description="Independent approval for protected Vendor mutations",
            requires_approval=True,
            approver_roles=["risk_manager", "cro"],
        )
    )
    await db_session.commit()
    vendor_name = "Vendor same-name submit resolution race"
    payload = {
        "name": vendor_name,
        "process": "Operations",
        "outsourcing_owner_user_id": test_user_cro.id,
        "department_id": test_user_cro.department_id,
        "replaceability": "not_substitutable",
        "request_reason": "Serialize same-name Vendor creation",
    }
    async with client_factory(user=test_user_cro) as requester:
        submitted = await requester.post("/api/v1/vendors", json=payload)
    assert submitted.status_code == 202, submitted.text

    resolution_name_locked = asyncio.Event()
    competing_name_locked = asyncio.Event()
    decision_locked = asyncio.Event()
    release_resolution = asyncio.Event()
    original_resolution_name_lock = (
        vendor_resolution.acquire_vendor_creation_name_lock
    )
    original_submission_name_lock = (
        vendor_mutations.acquire_vendor_creation_name_lock
    )
    original_live_policy = vendor_resolution._live_policy

    async def observed_resolution_name_lock(*args, **kwargs):
        await original_resolution_name_lock(*args, **kwargs)
        resolution_name_locked.set()

    async def observed_submission_name_lock(*args, **kwargs):
        await original_submission_name_lock(*args, **kwargs)
        competing_name_locked.set()

    async def paused_live_policy(*args, **kwargs):
        result = await original_live_policy(*args, **kwargs)
        decision_locked.set()
        await release_resolution.wait()
        return result

    monkeypatch.setattr(
        vendor_resolution,
        "acquire_vendor_creation_name_lock",
        observed_resolution_name_lock,
    )
    monkeypatch.setattr(
        vendor_mutations,
        "acquire_vendor_creation_name_lock",
        observed_submission_name_lock,
    )
    monkeypatch.setattr(vendor_resolution, "_live_policy", paused_live_policy)
    session_maker = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def independent_db_session():
        async with session_maker() as session:
            await session.execute(text("SET LOCAL lock_timeout = '3s'"))
            yield session

    async with (
        client_factory(
            user=test_user_risk_manager,
            db_override=independent_db_session,
        ) as approver,
        client_factory(
            user=test_user_cro,
            db_override=independent_db_session,
        ) as competing_requester,
    ):
        resolving = asyncio.create_task(
            approver.post(
                f"/api/v1/approvals/{submitted.json()['approval_id']}/approve",
                json={"resolution_notes": "Serialize same-name creation"},
            )
        )
        await asyncio.wait_for(decision_locked.wait(), timeout=5)
        competing = asyncio.create_task(
            competing_requester.post("/api/v1/vendors", json=payload)
        )
        try:
            await asyncio.sleep(0.15)
            assert resolution_name_locked.is_set()
            assert not competing_name_locked.is_set()
            assert not competing.done()
        finally:
            release_resolution.set()
        resolved, competing_submission = await asyncio.wait_for(
            asyncio.gather(resolving, competing),
            timeout=10,
        )

    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "approved"
    assert competing_submission.status_code == 202, competing_submission.text
