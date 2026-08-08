"""Lock acquisition order for direct Sub-outsourcing mutations (ticket #105).

Approval resolution (``vendor_resolution.py``) acquires the Vendor row lock
(``_live_policy``) BEFORE the sub-outsourcing chain advisory lock, then child
rows. The four direct lifecycle paths must follow the same canonical order —
owner-identity advisory lock -> Vendor row FOR UPDATE -> chain advisory lock —
or a direct mutation and a concurrent approval resolution on the same Vendor
deadlock (ABBA lock inversion: direct held the chain lock while waiting on the
Vendor row the resolution already held).

These tests instrument the ACTUAL runtime acquisition sequence, not source
text: the lock-acquiring helpers are wrapped with a recorder appending one
``(lock_kind, key)`` event per helper call in acquisition order (per-helper
recording semantics are documented on ``_install_lock_recorder``), then
each of the four direct service paths (create, update, archive, restore) is
driven through a single session and the recorded sequence is compared
exactly against the canonical order. Deterministic by construction: one session, no concurrency, no timing.
The recorder observes the helper calls themselves, which run on SQLite too
(their Postgres-only SQL no-ops internally), so no dialect skip is needed.
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Vendor, VendorContract, VendorSubOutsourcing
from app.schemas.vendor_sub_outsourcing import (
    VendorSubOutsourcingCreate,
    VendorSubOutsourcingUpdate,
)
from app.services._vendor_governance.sub_outsourcing_lifecycle import (
    archive_vendor_sub_outsourcing_detail,
    create_vendor_sub_outsourcing_detail,
    restore_vendor_sub_outsourcing_detail,
    update_vendor_sub_outsourcing_detail,
)


def _install_lock_recorder(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, object]]:
    """Wrap the lock-acquiring helpers to record actual acquisition order.

    Each helper is patched at the module whose binding its call site
    resolves, so the wrappers intercept the real runtime calls.

    - owner-identity advisory locks: recorded as ONE aggregate event on helper
      entry, carrying the exact input keys (per-key ordering is the helper's
      internal concern and is not re-derived here);
    - Vendor row FOR UPDATE: recorded when ``lock_vendor_for_owner_mutation``
      returns — the row lock is held at that point, after the identity locks
      the helper acquires internally (recording on entry would misreport the
      composite helper as locking the row before the identity locks);
    - chain advisory lock: recorded on helper entry, via the lifecycle
      module's binding so exactly the direct-path call sites are observed.
    """
    from app.services import _vendor_owner_lock
    from app.services._vendor_governance import policy, sub_outsourcing_lifecycle

    recorded: list[tuple[str, object]] = []

    original_identity = _vendor_owner_lock.acquire_vendor_owner_identity_locks

    async def recording_identity_locks(db, *, user_ids):
        ids = tuple(user_ids)
        recorded.append(("identity_locks", ids))
        await original_identity(db, user_ids=ids)

    monkeypatch.setattr(
        _vendor_owner_lock,
        "acquire_vendor_owner_identity_locks",
        recording_identity_locks,
    )

    original_row_lock = policy.lock_vendor_for_owner_mutation

    async def recording_vendor_row_lock(db, *, vendor_id, user_ids, **kwargs):
        vendor = await original_row_lock(db, vendor_id=vendor_id, user_ids=user_ids, **kwargs)
        recorded.append(("vendor_row_for_update", vendor_id))
        return vendor

    monkeypatch.setattr(policy, "lock_vendor_for_owner_mutation", recording_vendor_row_lock)

    original_chain = sub_outsourcing_lifecycle.acquire_sub_outsourcing_chain_lock

    async def recording_chain_lock(db, *, vendor_id):
        recorded.append(("sub_outsourcing_chain_advisory", vendor_id))
        await original_chain(db, vendor_id=vendor_id)

    monkeypatch.setattr(
        sub_outsourcing_lifecycle,
        "acquire_sub_outsourcing_chain_lock",
        recording_chain_lock,
    )
    return recorded


def _canonical_order(*, owner_id: int, vendor_id: int) -> list[tuple[str, object]]:
    """The documented canonical order approval resolution relies on."""
    return [
        ("identity_locks", (owner_id,)),
        ("vendor_row_for_update", vendor_id),
        ("sub_outsourcing_chain_advisory", vendor_id),
    ]


async def _chain_scenario(
    db_session: AsyncSession, *, department_id: int, owner: User
) -> tuple[Vendor, VendorContract]:
    vendor = Vendor(
        name="Lock Order Vendor",
        process="IT",
        department_id=department_id,
        outsourcing_owner_user_id=owner.id,
    )
    db_session.add(vendor)
    await db_session.commit()
    contract = VendorContract(vendor_id=vendor.id, contract_reference="SML-2020-105")
    db_session.add(contract)
    await db_session.commit()
    return vendor, contract


async def _chain_entry(
    db_session: AsyncSession,
    *,
    vendor: Vendor,
    contract: VendorContract,
    archived_by: User | None = None,
) -> VendorSubOutsourcing:
    entry = VendorSubOutsourcing(vendor_id=vendor.id, contract_id=contract.id)
    if archived_by is not None:
        entry.mark_archived(archived_by)
    db_session.add(entry)
    await db_session.commit()
    return entry


@pytest.mark.asyncio
async def test_create_acquires_locks_in_canonical_order(
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    vendor, contract = await _chain_scenario(
        db_session, department_id=test_department.id, owner=test_user_cro
    )
    recorded = _install_lock_recorder(monkeypatch)

    await create_vendor_sub_outsourcing_detail(
        db=db_session,
        vendor_id=vendor.id,
        payload=VendorSubOutsourcingCreate(contract_id=contract.id),
        current_user=test_user_cro,
    )

    assert recorded == _canonical_order(owner_id=test_user_cro.id, vendor_id=vendor.id)


@pytest.mark.asyncio
async def test_update_acquires_locks_in_canonical_order(
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    vendor, contract = await _chain_scenario(
        db_session, department_id=test_department.id, owner=test_user_cro
    )
    entry = await _chain_entry(db_session, vendor=vendor, contract=contract)
    recorded = _install_lock_recorder(monkeypatch)

    await update_vendor_sub_outsourcing_detail(
        db=db_session,
        vendor_id=vendor.id,
        entry_id=entry.id,
        payload=VendorSubOutsourcingUpdate(note="Canonical order note"),
        current_user=test_user_cro,
    )

    assert recorded == _canonical_order(owner_id=test_user_cro.id, vendor_id=vendor.id)


@pytest.mark.asyncio
async def test_archive_acquires_locks_in_canonical_order(
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    vendor, contract = await _chain_scenario(
        db_session, department_id=test_department.id, owner=test_user_cro
    )
    entry = await _chain_entry(db_session, vendor=vendor, contract=contract)
    recorded = _install_lock_recorder(monkeypatch)

    await archive_vendor_sub_outsourcing_detail(
        db=db_session,
        vendor_id=vendor.id,
        entry_id=entry.id,
        current_user=test_user_cro,
    )

    assert recorded == _canonical_order(owner_id=test_user_cro.id, vendor_id=vendor.id)


@pytest.mark.asyncio
async def test_restore_acquires_locks_in_canonical_order(
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    vendor, contract = await _chain_scenario(
        db_session, department_id=test_department.id, owner=test_user_cro
    )
    entry = await _chain_entry(
        db_session, vendor=vendor, contract=contract, archived_by=test_user_cro
    )
    recorded = _install_lock_recorder(monkeypatch)

    await restore_vendor_sub_outsourcing_detail(
        db=db_session,
        vendor_id=vendor.id,
        entry_id=entry.id,
        current_user=test_user_cro,
    )

    assert recorded == _canonical_order(owner_id=test_user_cro.id, vendor_id=vendor.id)
