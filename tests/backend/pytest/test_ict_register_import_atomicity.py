"""Atomicity contracts for the one-time ICT Register cutover import (#53)."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from structlog.testing import capture_logs

from app.models import ActivityLog, Process, Risk, User
from app.schemas.risk import RiskCreate
from app.services._entity_mutation_lifecycle import direct_apply
from app.services._entity_mutation_lifecycle.lifecycle import create_risk_detail
from app.services._governed_mutations import vendor_mutations
from app.services._vendor_links import workflow as vendor_link_workflow
from app.services.transaction_boundary import (
    commit_service_boundary,
    defer_service_boundary_commits,
)
from scripts import import_ict_register_workbook as importer
from scripts._ict_register_cutover import ICTRegisterAccountabilityMap

IMPORT_PHASE_NAMES = (
    "apply_parameter_overlay",
    "import_vendors",
    "import_contracts",
    "import_processes",
    "import_assets",
    "import_process_asset_links",
    "import_asset_vendor_links",
    "import_process_vendor_links",
    "import_threats",
    "import_risks",
)
CUTOVER_KWARGS = {
    "cutover_authorized_by": "cro@riskhub.local",
    "authorization_reference": "#53",
    "accountability_map_path": Path("accountability-map"),
}


@pytest.fixture(autouse=True)
def isolate_transaction_tests_from_cutover_preflight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """These tests exercise transaction behavior; policy has its own public suite."""

    class NoopWindow:
        async def audit_authorization(self) -> None:
            return None

        async def suspend(self) -> None:
            return None

        async def restore(self) -> None:
            return None

        async def complete(self, _state_digest: str) -> None:
            return None

    profile = SimpleNamespace(parameter_values={})
    accountability_map = ICTRegisterAccountabilityMap(
        digest="map-digest",
        synthetic_owner_email="risk.manager@riskhub.local",
        owning_department_code="RISK",
        owning_department_name="Risk Management",
        process_source_owners={},
        asset_source_owners={},
    )

    async def load_window(*_args, **_kwargs):
        return NoopWindow()

    async def load_profile(*_args, **_kwargs):
        return profile

    async def state_digest(*_args, **_kwargs):
        return "isolated-transaction-test-state"

    async def resolve_accountability(*_args, **_kwargs):
        return SimpleNamespace(owner_user_id=1, owning_department_id=1)

    monkeypatch.setattr(importer, "require_postgresql_cutover", lambda _db: None)
    monkeypatch.setattr(
        importer,
        "_cutover_target_profile",
        lambda _seed, **_kwargs: profile,
    )
    monkeypatch.setattr(
        importer,
        "load_ict_register_accountability_map",
        lambda *_args, **_kwargs: accountability_map,
    )
    monkeypatch.setattr(importer, "resolve_ict_register_accountability", resolve_accountability)
    monkeypatch.setattr(importer, "apply_ict_register_accountability", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(importer, "load_authorized_cutover_window", load_window)
    monkeypatch.setattr(importer, "load_cutover_target_profile", load_profile)
    monkeypatch.setattr(importer, "classify_cutover_target", lambda *_args: "fresh")
    monkeypatch.setattr(importer, "cutover_state_digest", state_digest)


async def _run_import(source) -> int:
    return await importer.run_import(source, **CUTOVER_KWARGS)


class CountingAsyncSession(AsyncSession):
    """Real AsyncSession that exposes how many physical commits occurred."""

    commit_count = 0

    async def commit(self) -> None:
        type(self).commit_count += 1
        await super().commit()


class RecordingBoundarySession:
    def __init__(self) -> None:
        self.commits = 0
        self.flushes = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def flush(self) -> None:
        self.flushes += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


class RollbackFailingBoundarySession(RecordingBoundarySession):
    async def rollback(self) -> None:
        await super().rollback()
        raise RuntimeError("secondary rollback failure")


class SecondRollbackFailingSession(RecordingBoundarySession):
    def __init__(self, *, fail_flush: bool = False) -> None:
        super().__init__()
        self.fail_flush = fail_flush

    async def commit(self) -> None:
        await super().commit()
        raise RuntimeError("primary commit failure")

    async def flush(self) -> None:
        await super().flush()
        if self.fail_flush:
            raise RuntimeError("primary flush failure")

    async def rollback(self) -> None:
        await super().rollback()
        if self.rollbacks == 2:
            raise RuntimeError("secondary outer rollback failure")


def assert_secondary_service_rollback_logged(
    events: list[dict[str, object]],
    *,
    boundary: str,
) -> None:
    assert [event for event in events if event.get("event") == "service_transaction.rollback_failed"] == [
        {
            "event": "service_transaction.rollback_failed",
            "transaction_boundary": boundary,
            "error_type": "RuntimeError",
            "error": "secondary outer rollback failure",
            "exc_info": True,
            "log_level": "error",
        }
    ]


def _patch_remaining_phases(
    monkeypatch: pytest.MonkeyPatch,
    *,
    contract_phase,
    process_phase=None,
) -> None:
    async def no_op_phase(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(importer, "apply_parameter_overlay", no_op_phase)
    monkeypatch.setattr(importer, "import_contracts", contract_phase)
    monkeypatch.setattr(importer, "import_processes", process_phase or no_op_phase)
    for phase_name in (
        "import_assets",
        "import_process_asset_links",
        "import_asset_vendor_links",
        "import_process_vendor_links",
        "import_threats",
        "import_risks",
    ):
        monkeypatch.setattr(importer, phase_name, no_op_phase)


def _risk_payload(*, department_id: int, owner_id: int) -> RiskCreate:
    return RiskCreate(
        risk_id_code="CUTOVER-ATOMIC-R01",
        name="Early cutover risk",
        process="ICT register cutover",
        description="Must remain atomic across all import phases",
        department_id=department_id,
        owner_id=owner_id,
        risk_type="operational",
        category="Operational",
        gross_probability=1,
        gross_impact=1,
        net_probability=1,
        net_impact=1,
    )


@pytest.mark.asyncio
async def test_risk_direct_update_preserves_commit_failure_when_outer_rollback_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = SecondRollbackFailingSession()
    risk = SimpleNamespace(
        id=1,
        name="Atomic cutover risk",
        description="Rollback masking regression",
        risk_id_code="RIZ-001",
        department_id=None,
        gross_probability=1,
        gross_impact=1,
        gross_score=1,
        net_probability=1,
        net_impact=1,
        net_score=1,
    )

    async def no_op_audit(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(direct_apply, "risk_updated", no_op_audit)

    with capture_logs() as events:
        with pytest.raises(RuntimeError, match="primary commit failure"):
            await direct_apply.apply_risk_update_directly(
                session,
                risk=risk,
                update_data={"net_probability": 2},
                current_user=SimpleNamespace(id=1),
            )

    assert session.commits == 1
    assert session.rollbacks == 2
    assert_secondary_service_rollback_logged(
        events,
        boundary="entity_mutation.update_risk",
    )


@pytest.mark.asyncio
async def test_vendor_link_preserves_deferred_flush_failure_when_outer_rollback_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = SecondRollbackFailingSession(fail_flush=True)
    vendor = SimpleNamespace(governance_version=0)

    async def prepared_mutation(*_args, **_kwargs):
        return SimpleNamespace(), vendor, "RIZ-001"

    async def no_queued_mutation(**_kwargs):
        return None

    async def linked_without_commit(*_args, **_kwargs):
        return {"detail": "linked"}

    monkeypatch.setattr(
        vendor_link_workflow,
        "_prepare_vendor_link_mutation",
        prepared_mutation,
    )
    monkeypatch.setattr(
        vendor_mutations,
        "submit_vendor_relationship_mutation_if_required",
        no_queued_mutation,
    )
    monkeypatch.setattr(
        vendor_link_workflow,
        "_link_vendor_target_prepared_no_commit",
        linked_without_commit,
    )

    with capture_logs() as events:
        with pytest.raises(RuntimeError, match="primary flush failure"):
            with defer_service_boundary_commits(session):
                await vendor_link_workflow.link_vendor_target(
                    session,
                    vendor_id=1,
                    current_user=SimpleNamespace(id=1),
                    kind="risk",
                    entity_id=1,
                )

    assert session.flushes == 1
    assert session.rollbacks == 2
    assert_secondary_service_rollback_logged(
        events,
        boundary="vendor_link.risk.create",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("failure_type", [RuntimeError, asyncio.CancelledError])
async def test_run_import_rolls_back_an_early_service_write_when_a_later_phase_fails(
    async_engine,
    db_session: AsyncSession,
    test_department,
    test_user: User,
    seed_risk_types,
    monkeypatch: pytest.MonkeyPatch,
    failure_type: type[BaseException],
) -> None:
    """A public import failure leaves neither its Risk nor its audit fact behind."""
    test_user.email = importer.IMPORT_USER_EMAIL
    await db_session.commit()

    session_factory = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    @asynccontextmanager
    async def real_session_context(_settings):
        async with session_factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    async def import_one_real_risk(db, _seed, user, report):
        await create_risk_detail(
            db=db,
            risk_data=_risk_payload(department_id=test_department.id, owner_id=user.id),
            current_user=user,
        )
        report.counters("risks").created += 1
        return {}

    async def fail_next_phase(*_args, **_kwargs):
        raise failure_type("deterministic later-phase failure")

    monkeypatch.setattr(importer, "session_context", real_session_context)
    monkeypatch.setattr(importer, "load_builder_seed", lambda _source: SimpleNamespace())
    monkeypatch.setattr(importer, "import_vendors", import_one_real_risk)
    _patch_remaining_phases(monkeypatch, contract_phase=fail_next_phase)

    with pytest.raises(failure_type, match="deterministic later-phase failure"):
        await _run_import(SimpleNamespace())

    async with session_factory() as fresh_session:
        risk_count = (
            await fresh_session.execute(select(func.count(Risk.id)).where(Risk.risk_id_code == "CUTOVER-ATOMIC-R01"))
        ).scalar_one()
        audit_count = (await fresh_session.execute(select(func.count(ActivityLog.id)))).scalar_one()

    assert risk_count == 0
    assert audit_count == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("failure_type", [RuntimeError, asyncio.CancelledError])
async def test_run_import_preserves_phase_failure_when_rollback_also_fails(
    failure_type: type[BaseException],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = RollbackFailingBoundarySession()

    @asynccontextmanager
    async def failing_session_context(_settings):
        yield session

    async def import_user(_db):
        return SimpleNamespace(email=importer.IMPORT_USER_EMAIL, id=1)

    async def fail_import_phases(*_args, **_kwargs):
        raise failure_type("primary import failure")

    monkeypatch.setattr(importer, "session_context", failing_session_context)
    monkeypatch.setattr(importer, "load_builder_seed", lambda _source: SimpleNamespace())
    monkeypatch.setattr(importer, "load_import_user", import_user)
    monkeypatch.setattr(importer, "_run_import_phases", fail_import_phases)

    with capture_logs() as events:
        with pytest.raises(failure_type, match="primary import failure"):
            await _run_import(SimpleNamespace())

    assert session.rollbacks == 1
    assert [event for event in events if event.get("event") == "service_transaction.rollback_failed"] == [
        {
            "event": "service_transaction.rollback_failed",
            "transaction_boundary": "ict_register_cutover_import",
            "error_type": "RuntimeError",
            "error": "secondary rollback failure",
            "exc_info": True,
            "log_level": "error",
        }
    ]


@pytest.mark.asyncio
async def test_run_import_rolls_back_reported_findings_and_returns_two(
    async_engine,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    seed_risk_types,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_user_cro.email = importer.IMPORT_USER_EMAIL
    await db_session.commit()
    session_factory = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    @asynccontextmanager
    async def real_session_context(_settings):
        async with session_factory() as session:
            yield session

    async def import_one_real_risk(db, _seed, user, report):
        await create_risk_detail(
            db=db,
            risk_data=_risk_payload(department_id=test_department.id, owner_id=user.id),
            current_user=user,
        )
        report.counters("risks").created += 1
        return {}

    async def report_finding(_db, _seed, _user, _vendor_ids, report):
        report.finding("deterministic service-layer rejection")

    monkeypatch.setattr(importer, "session_context", real_session_context)
    monkeypatch.setattr(importer, "load_builder_seed", lambda _source: SimpleNamespace())
    monkeypatch.setattr(importer, "import_vendors", import_one_real_risk)
    _patch_remaining_phases(monkeypatch, contract_phase=report_finding)

    assert await _run_import(SimpleNamespace()) == 2

    async with session_factory() as fresh_session:
        assert (
            await fresh_session.execute(select(func.count(Risk.id)).where(Risk.risk_id_code == "CUTOVER-ATOMIC-R01"))
        ).scalar_one() == 0
        assert (await fresh_session.execute(select(func.count(ActivityLog.id)))).scalar_one() == 0


@pytest.mark.asyncio
async def test_run_import_commits_once_and_an_idempotent_rerun_creates_nothing(
    async_engine,
    db_session: AsyncSession,
    test_department,
    test_user_cro: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_user_cro.email = importer.IMPORT_USER_EMAIL
    await db_session.commit()
    CountingAsyncSession.commit_count = 0
    session_factory = async_sessionmaker(
        async_engine,
        class_=CountingAsyncSession,
        expire_on_commit=False,
    )

    @asynccontextmanager
    async def real_session_context(_settings):
        async with session_factory() as session:
            yield session

    async def no_op_contracts(*_args, **_kwargs):
        return None

    seed = SimpleNamespace(
        SRC={
            "processes": [
                {
                    "l0": "Claims",
                    "l1": "Cutover atomicity",
                    "l2": "Natural-key process",
                    "process_owner_user_id": test_user_cro.id,
                    "owning_department_id": test_department.id,
                    "src_class": "Nízká",
                    "kdf_override": "Ne",
                    "bcm": "Nerelevantní",
                }
            ]
        }
    )
    monkeypatch.setattr(importer, "session_context", real_session_context)
    monkeypatch.setattr(importer, "load_builder_seed", lambda _source: seed)

    async def no_op_vendors(*_args, **_kwargs):
        return {}

    monkeypatch.setattr(importer, "import_vendors", no_op_vendors)
    _patch_remaining_phases(
        monkeypatch,
        contract_phase=no_op_contracts,
        process_phase=importer.import_processes,
    )

    assert await _run_import(SimpleNamespace()) == 0
    assert CountingAsyncSession.commit_count == 1
    assert await _run_import(SimpleNamespace()) == 0
    assert CountingAsyncSession.commit_count == 2

    async with session_factory() as fresh_session:
        assert (
            await fresh_session.execute(
                select(func.count(Process.id)).where(
                    Process.l0_area == "Claims",
                    Process.l1_process == "Cutover atomicity",
                    Process.l2_subprocess == "Natural-key process",
                )
            )
        ).scalar_one() == 1
        assert (await fresh_session.execute(select(func.count(ActivityLog.id)))).scalar_one() == 1


@pytest.mark.asyncio
async def test_run_import_stops_after_a_required_vendor_finding_before_contracts(
    async_engine,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A rejected required Vendor returns findings instead of cascading to KeyError."""
    test_user.email = importer.IMPORT_USER_EMAIL
    await db_session.commit()
    session_factory = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    @asynccontextmanager
    async def real_session_context(_settings):
        async with session_factory() as session:
            yield session

    seed = SimpleNamespace(BIZ_DATA={"nazev": "Rejected required Vendor"})
    real_contract_phase = importer.import_contracts
    contract_calls = 0

    async def reject_required_vendor(_db, _seed, _user, report):
        report.finding("required Vendor rejected")
        return {}

    async def observed_real_contract_phase(*args, **kwargs):
        nonlocal contract_calls
        contract_calls += 1
        return await real_contract_phase(*args, **kwargs)

    async def no_op_phase(*_args, **_kwargs):
        return None

    monkeypatch.setattr(importer, "session_context", real_session_context)
    monkeypatch.setattr(importer, "load_builder_seed", lambda _source: seed)
    monkeypatch.setattr(importer, "apply_parameter_overlay", no_op_phase)
    monkeypatch.setattr(importer, "import_vendors", reject_required_vendor)
    _patch_remaining_phases(
        monkeypatch,
        contract_phase=observed_real_contract_phase,
    )

    assert await _run_import(SimpleNamespace()) == 2
    assert contract_calls == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("finding_phase", IMPORT_PHASE_NAMES)
async def test_import_phase_runner_stops_after_a_finding_from_every_phase(
    finding_phase: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    def phase_stub(phase_name: str):
        async def run_phase(*args):
            calls.append(phase_name)
            report = args[-1]
            if phase_name == finding_phase:
                report.finding(f"finding from {phase_name}")
            if phase_name in {
                "import_vendors",
                "import_processes",
                "import_assets",
                "import_threats",
            }:
                return {}
            return None

        return run_phase

    for phase_name in IMPORT_PHASE_NAMES:
        monkeypatch.setattr(importer, phase_name, phase_stub(phase_name))

    report = importer.ImportReport()
    await importer._run_import_phases(object(), SimpleNamespace(), object(), report)

    finding_index = IMPORT_PHASE_NAMES.index(finding_phase)
    assert calls == list(IMPORT_PHASE_NAMES[: finding_index + 1])
    assert report.findings == [f"finding from {finding_phase}"]


@pytest.mark.asyncio
async def test_deferred_commit_scope_restores_normal_commits_after_every_exit() -> None:
    session = RecordingBoundarySession()

    with defer_service_boundary_commits(session):
        await commit_service_boundary(session, boundary="nested_success")
    await commit_service_boundary(session, boundary="after_success")

    with pytest.raises(RuntimeError, match="scope failure"):
        with defer_service_boundary_commits(session):
            await commit_service_boundary(session, boundary="nested_failure")
            raise RuntimeError("scope failure")
    await commit_service_boundary(session, boundary="after_failure")

    assert session.flushes == 2
    assert session.commits == 2
    assert session.rollbacks == 0
