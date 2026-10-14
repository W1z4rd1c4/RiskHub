"""Cross-dialect regression for the shared canonical UUID4 SQL predicate."""

from __future__ import annotations

import pytest
from app.core.sql_uuid import CanonicalUuid4
from app.models import (
    ApprovalActionType,
    ApprovalRequest,
    ApprovalResourceType,
    ApprovalStatus,
    GovernedMutationProposal,
    User,
)
from app.services._governed_mutations.process_identity import (
    CanonicalUuid4 as ProcessCanonicalUuid4,
)
from app.services._governed_mutations.process_identity import (
    InvalidGovernedProcessIdentity,
    new_governed_process_proposal,
    strict_governed_process_identity,
    valid_governed_process_proposal_exists_clause,
)
from app.services.notification_visibility import (
    CanonicalUuid4 as NotificationCanonicalUuid4,
)
from app.services.notification_visibility import (
    _strict_asset_proposal_shape_clause,
    _strict_vendor_proposal_shape_clause,
)
from sqlalchemy import Boolean, String, bindparam, literal, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

VALID_UUID = "12345678-1234-4234-8234-123456789abc"
MISPLACED_HYPHEN_UUID = "-2345678-1234-4234-8234-123456789abc"


def test_callers_share_cacheable_boolean_sql_predicate() -> None:
    assert ProcessCanonicalUuid4 is NotificationCanonicalUuid4 is CanonicalUuid4
    expression = CanonicalUuid4(literal(VALID_UUID, String()))
    assert isinstance(expression.type, Boolean)
    assert expression._generate_cache_key() is not None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "predicate",
    [
        pytest.param(ProcessCanonicalUuid4, id="process"),
        pytest.param(NotificationCanonicalUuid4, id="notification"),
    ],
)
async def test_sql_predicate_rejects_misplaced_hyphen(
    db_session: AsyncSession,
    predicate,
) -> None:
    assert await db_session.scalar(select(predicate(literal(MISPLACED_HYPHEN_UUID)))) is False


@pytest.mark.asyncio
async def test_canonical_uuid4_text_matrix(db_session: AsyncSession) -> None:
    cases = [
        ("canonical", VALID_UUID, True),
        ("zero_hex", "00000000-0000-4000-8000-000000000000", True),
        ("sql_null", None, None),
        ("empty", "", False),
        ("arbitrary", "not-a-uuid", False),
        ("numeric_text", "1234", False),
        ("uppercase", VALID_UUID.upper(), False),
        ("version_1", VALID_UUID[:14] + "1" + VALID_UUID[15:], False),
        ("version_5", VALID_UUID[:14] + "5" + VALID_UUID[15:], False),
        ("variant_7", VALID_UUID[:19] + "7" + VALID_UUID[20:], False),
        ("variant_c", VALID_UUID[:19] + "c" + VALID_UUID[20:], False),
        ("non_hex", "g" + VALID_UUID[1:], False),
        ("short", VALID_UUID[:-1], False),
        ("long", VALID_UUID + "0", False),
        ("compact", VALID_UUID.replace("-", ""), False),
        ("braces", "{" + VALID_UUID + "}", False),
        ("leading_space", " " + VALID_UUID, False),
        ("trailing_space", VALID_UUID + " ", False),
        ("trailing_newline", VALID_UUID + "\n", False),
        ("missing_separator", VALID_UUID[:8] + "0" + VALID_UUID[9:], False),
    ]
    cases.extend(
        (f"variant_{variant}", VALID_UUID[:19] + variant + VALID_UUID[20:], True)
        for variant in "9ab"
    )
    cases.extend(
        (f"extra_hyphen_at_{index}", VALID_UUID[:index] + "-" + VALID_UUID[index + 1 :], False)
        for index, character in enumerate(VALID_UUID)
        if character != "-"
    )
    # One statement exercises the dialect and SQLAlchemy Boolean result handling
    # for every representation without recreating the database for each value.
    row = (
        await db_session.execute(
            select(*(CanonicalUuid4(literal(value, String())) for _, value, _ in cases))
        )
    ).one()
    for (name, _, expected), actual in zip(cases, row, strict=True):
        assert actual is expected, name


@pytest.mark.asyncio
async def test_canonical_uuid4_preserves_sql_null_logic(db_session: AsyncSession) -> None:
    predicate = CanonicalUuid4(literal(None, String()))
    row = (await db_session.execute(select(predicate, ~predicate, predicate.is_(False)))).one()
    assert tuple(row) == (None, None, False)
    assert await db_session.scalar(select(literal(1)).where(predicate)) is None


@pytest.mark.asyncio
async def test_canonical_uuid4_reuses_bound_statement(db_session: AsyncSession) -> None:
    statement = select(CanonicalUuid4(bindparam("candidate", type_=String())))
    for value, expected in [(VALID_UUID, True), (MISPLACED_HYPHEN_UUID, False), (None, None)]:
        assert await db_session.scalar(statement, {"candidate": value}) is expected


@pytest.mark.asyncio
async def test_canonical_uuid4_executes_escaped_literal_binds(db_session: AsyncSession) -> None:
    cases = [(VALID_UUID, True), (VALID_UUID + "' OR 1=1 --", False), (None, None)]
    for value, expected in cases:
        statement = select(CanonicalUuid4(literal(value, String())).label("is_canonical"))
        sql = str(statement.compile(dialect=db_session.bind.dialect, compile_kwargs={"literal_binds": True}))
        assert await db_session.scalar(text(sql).columns(is_canonical=Boolean())) is expected


@pytest.mark.asyncio
@pytest.mark.parametrize("value", [1234, 1.25, True, VALID_UUID.encode()], ids=["integer", "float", "boolean", "blob"])
async def test_canonical_uuid4_does_not_coerce_nontext_sql_types(
    db_session: AsyncSession,
    value: object,
) -> None:
    statement = select(CanonicalUuid4(literal(value)))
    if db_session.bind.dialect.name == "postgresql":
        # Preserve the native regex operator's text-only input contract.
        with pytest.raises(DBAPIError) as error:
            await db_session.execute(statement)
        assert error.value.orig.sqlstate == "42883"
    else:
        assert await db_session.scalar(statement) is False


@pytest.mark.asyncio
@pytest.mark.parametrize("value", [VALID_UUID + "\x00suffix", VALID_UUID[:4] + "\x00" + VALID_UUID[5:]])
async def test_canonical_uuid4_rejects_nul_text(db_session: AsyncSession, value: str) -> None:
    statement = select(CanonicalUuid4(literal(value, String())))
    if db_session.bind.dialect.name == "postgresql":
        # PostgreSQL text storage itself rejects NUL before regex evaluation.
        with pytest.raises(DBAPIError) as error:
            await db_session.execute(statement)
        assert error.value.orig.sqlstate == "22021"
    else:
        assert await db_session.scalar(statement) is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("proposal_id", "expected"),
    [(VALID_UUID, True), (MISPLACED_HYPHEN_UUID, False)],
    ids=["canonical", "misplaced_hyphen"],
)
async def test_process_identity_exists_clause_uses_shared_uuid_validation(
    db_session: AsyncSession,
    test_user_employee: User,
    proposal_id: str,
    expected: bool,
) -> None:
    approval = ApprovalRequest(
        resource_type=ApprovalResourceType.PROCESS,
        resource_id=900_001,
        resource_name="UUID regression process",
        action_type=ApprovalActionType.EDIT,
        pending_changes={"notes": {"old": "old", "new": "new"}},
        requested_by_id=test_user_employee.id,
        reason="UUID SQL regression",
        status=ApprovalStatus.PENDING,
        scenario_key="protected_process_edit",
        scenario_approver_roles=["cro"],
        requires_privileged_approval=False,
    )
    db_session.add(approval)
    await db_session.flush()
    proposal = new_governed_process_proposal(
        approval_request_id=approval.id,
        requested_by_id=test_user_employee.id,
        process_id=approval.resource_id,
        process_name=approval.resource_name,
        approver_roles=["cro"],
        base_governance_version=1,
        before_snapshot={"notes": "old"},
        after_snapshot={"notes": "new"},
        raw_before={"notes": "old"},
        raw_after={"notes": "new"},
        derived_impact_snapshot={
            "before": {"cif": "yes", "criticality_class": "critical"},
            "after": {"cif": "yes", "criticality_class": "critical"},
        },
    )
    proposal.proposal_id = proposal_id
    if expected:
        assert strict_governed_process_identity(proposal) is not None
    else:
        with pytest.raises(InvalidGovernedProcessIdentity):
            strict_governed_process_identity(proposal)
    db_session.add(proposal)
    await db_session.flush()

    assert await db_session.scalar(
        select(valid_governed_process_proposal_exists_clause())
        .select_from(ApprovalRequest)
        .where(ApprovalRequest.id == approval.id)
    ) is expected


@pytest.mark.asyncio
@pytest.mark.parametrize("resource_type", [ApprovalResourceType.ASSET, ApprovalResourceType.VENDOR])
@pytest.mark.parametrize(
    "corruption", [None, "uuid", "scenario"], ids=["canonical", "misplaced_hyphen", "invalid_envelope"]
)
async def test_notification_shape_callers_use_shared_uuid_validation(
    db_session: AsyncSession,
    test_user_employee: User,
    resource_type: ApprovalResourceType,
    corruption: str | None,
) -> None:
    resource_name = "UUID notification shape"
    scenario_key = f"protected_{resource_type.value}_edit"
    approval = ApprovalRequest(
        resource_type=resource_type,
        resource_id=900_001,
        resource_name=resource_name,
        action_type=ApprovalActionType.EDIT,
        requested_by_id=test_user_employee.id,
        reason="UUID SQL regression",
        status=ApprovalStatus.PENDING,
        scenario_key=scenario_key,
        scenario_approver_roles=["cro"],
        requires_privileged_approval=False,
    )
    db_session.add(approval)
    await db_session.flush()
    proposal = GovernedMutationProposal(
        proposal_id=MISPLACED_HYPHEN_UUID if corruption == "uuid" else VALID_UUID,
        approval_request_id=approval.id,
        mutation_kind=f"{resource_type.value}.edit",
        primary_resource_type=resource_type.value,
        primary_resource_id=approval.resource_id,
        primary_resource_name=resource_name,
        requested_by_id=test_user_employee.id,
        scenario_snapshot={
            "key": "wrong_scenario" if corruption == "scenario" else scenario_key,
            "requires_approval": True,
            "approver_roles": ["cro"],
        },
        base_versions={},
        before_snapshot={},
        after_snapshot={},
        derived_impact_snapshot={},
        proposed_changes={},
        impacted_resources_snapshot=[],
    )
    db_session.add(proposal)
    await db_session.flush()
    shape_clause = (
        _strict_asset_proposal_shape_clause()
        if resource_type == ApprovalResourceType.ASSET
        else _strict_vendor_proposal_shape_clause()
    )
    assert await db_session.scalar(
        select(shape_clause)
        .join(ApprovalRequest, GovernedMutationProposal.approval_request_id == ApprovalRequest.id)
        .where(GovernedMutationProposal.id == proposal.id)
    ) is (corruption is None)
