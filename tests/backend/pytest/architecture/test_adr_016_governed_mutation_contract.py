from __future__ import annotations

import ast
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

ROOT = Path(__file__).resolve().parents[4]
ADR_PATH = ROOT / "docs/adr/ADR-016-governed-mutation-proposals.md"
RESOLUTION_PATH = ROOT / "backend/app/services/_governed_mutations/resolution.py"
EXTENDED_RESOLUTION_PATH = ROOT / "backend/app/services/_governed_mutations/resolution_extensions.py"
RESOLUTION_LOCK_PLAN_PATH = ROOT / "backend/app/services/_governed_mutations/resolution_lock_plan.py"
TERMINAL_TRANSITIONS_PATH = ROOT / "backend/app/services/_governed_mutations/terminal_transitions.py"
POLICY_PATH = ROOT / "backend/app/services/approval_scenario_policy.py"
PROCESS_IDENTITY_PATH = ROOT / "backend/app/services/_governed_mutations/process_identity.py"
QUEUE_QUERY_PATH = ROOT / "backend/app/services/_approval_queue/queries.py"
QUEUE_COUNT_PATH = ROOT / "backend/app/services/_approval_queue/counts.py"
PENDING_VISIBILITY_PATH = ROOT / "backend/app/services/approval_queue_visibility.py"
QUEUE_PROJECTION_PATH = ROOT / "backend/app/services/_approval_queue/projection.py"
USERS_SUMMARY_PATH = ROOT / "backend/app/api/v1/endpoints/users/summary.py"
DETAIL_PATH = ROOT / "backend/app/api/v1/endpoints/approvals/detail.py"
RESOLVE_PATH = ROOT / "backend/app/api/v1/endpoints/approvals/resolve.py"
NOTIFICATION_VISIBILITY_PATH = ROOT / "backend/app/services/notification_visibility.py"
NOTIFICATION_INBOX_PATH = ROOT / "backend/app/services/_notification_inbox/lifecycle.py"
ASSET_PROJECTION_PATH = ROOT / "backend/app/services/_ict_register_lifecycle/asset_projection.py"


def test_adr_016_is_indexed_and_accepted_before_implementation() -> None:
    adr = ADR_PATH.read_text(encoding="utf-8")
    index = (ROOT / "docs/adr/README.md").read_text(encoding="utf-8")

    assert "## Status\n\nAccepted" in adr
    assert "ADR-016-governed-mutation-proposals.md" in index


def test_adr_016_locks_the_proposal_identity_and_snapshot_contract() -> None:
    adr = ADR_PATH.read_text(encoding="utf-8")
    for invariant in (
        "proposal_id",
        "proposal_version",
        "insert-only",
        "base resource versions",
        "before and proposed after business snapshots",
        "derived-impact snapshot",
        "complete impacted-resource identities",
    ):
        assert invariant in adr


def test_adr_016_locks_atomic_impact_and_stale_resolution_semantics() -> None:
    adr = ADR_PATH.read_text(encoding="utf-8")
    for invariant in (
        "partial unique index",
        "current derived CIF == Ano OR proposed derived CIF == Ano",
        "Exactly one active configured Risk Manager or CRO",
        "mutable approval envelope, locks, operational row, or current policy expires",
        "commit_service_boundary",
        "Partial Composite application is forbidden",
        "Postgres concurrency tests are authoritative",
    ):
        assert invariant in adr


def test_adr_016_keeps_lifecycle_capabilities_and_notifications_separate() -> None:
    adr = ADR_PATH.read_text(encoding="utf-8")
    for invariant in (
        "Process lifecycle (`active`/`archived`) remains separate",
        "Backend capabilities are authoritative",
        "governed_approval_action_required",
        "governed_approval_request_updates",
        "adds no due date, SLA, reminder, overdue state",
    ):
        assert invariant in adr


def test_adr_016_pins_envelope_integrity_and_actor_role_lock_order() -> None:
    adr = ADR_PATH.read_text(encoding="utf-8")
    resolution = RESOLUTION_PATH.read_text(encoding="utf-8")
    extended_resolution = EXTENDED_RESOLUTION_PATH.read_text(encoding="utf-8")
    lock_plan = RESOLUTION_LOCK_PLAN_PATH.read_text(encoding="utf-8")

    assert "requester, resolver, and proposed-owner Role rows ordered by Role ID" in adr
    assert "requester-permission update versus approval races" in adr
    assert "proposed-owner role\nassignment versus approval races" in adr
    assert "resolver scope/department updates versus\napproval races" in adr
    assert "manager links\nare verified unchanged after locking" in adr
    assert "def _governed_envelope_stale_reason(" in resolution
    assert "actual_locks != expected_locks" in resolution
    assert "manager_snapshot = {row.id: row.manager_id" in resolution
    assert "can_resolve_process_approval(" in resolution
    role_lock = resolution.index(".where(Role.id.in_(reference_role_ids))")
    delegated_lock_plan = resolution.index("lock_governed_process_resolution_suffix(", role_lock)
    assert role_lock < delegated_lock_plan
    assert "lock_governed_process_resolution_suffix(" in extended_resolution
    department_lock = lock_plan.index("select(Department)")
    process_lock = lock_plan.index("select(Process)", department_lock)
    assert "select(Asset)" in lock_plan
    asset_lock = lock_plan.index("assets = await lock_governed_assets_for_resolution(", process_lock)
    parameter_lock = lock_plan.index("load_ict_workbook_parameter_set_for_update(db)")
    scenario_lock = lock_plan.index("select(ApprovalScenario)", parameter_lock)
    assert department_lock < process_lock < asset_lock < parameter_lock < scenario_lock


def test_adr_016_pins_queue_detail_and_notification_policy_parity() -> None:
    adr = ADR_PATH.read_text(encoding="utf-8")
    policy = POLICY_PATH.read_text(encoding="utf-8")
    process_identity = PROCESS_IDENTITY_PATH.read_text(encoding="utf-8")
    queue_query = QUEUE_QUERY_PATH.read_text(encoding="utf-8")
    queue_count = QUEUE_COUNT_PATH.read_text(encoding="utf-8")
    pending_visibility = PENDING_VISIBILITY_PATH.read_text(encoding="utf-8")
    queue_projection = QUEUE_PROJECTION_PATH.read_text(encoding="utf-8")
    users_summary = USERS_SUMMARY_PATH.read_text(encoding="utf-8")
    detail = DETAIL_PATH.read_text(encoding="utf-8")
    resolve = RESOLVE_PATH.read_text(encoding="utf-8")
    notification_visibility = NOTIFICATION_VISIBILITY_PATH.read_text(encoding="utf-8")
    notification_inbox = NOTIFICATION_INBOX_PATH.read_text(encoding="utf-8")
    asset_projection = ASSET_PROJECTION_PATH.read_text(encoding="utf-8")

    assert "immutable `GovernedMutationProposal`" in adr
    assert "def governed_process_approval_exists_clause(" in policy
    assert "def process_approval_resolver_clause(" in policy
    assert "def can_view_governed_process_snapshot(" in policy
    assert "def approval_resource_type_filter_clause(" in policy
    assert "def new_governed_process_proposal(" in process_identity
    assert "def strict_governed_process_identity(" in process_identity
    assert "def valid_governed_process_proposal_exists_clause(" in process_identity
    assert "def any_governed_mutation_proposal_exists_clause(" in process_identity
    assert "_strict_sql_identity_predicate()" in process_identity
    for source in (queue_query, pending_visibility, notification_visibility):
        assert "any_governed_mutation_proposal_exists_clause" in source
        assert "process_approval_resolver_clause" in source
    for source in (queue_query, pending_visibility):
        assert "governed_process_approval_exists_clause" in source
    assert "approval_resource_type_filter_clause" in queue_query
    assert "approval_resource_type_filter_clause" in pending_visibility
    assert "build_visible_pending_approvals_query" in queue_query
    assert "count_visible_pending_approvals_for_user" in queue_count
    assert "count_visible_pending_approvals_for_user" in users_summary
    assert "ApprovalRequest" not in queue_count
    assert "ApprovalRequest" not in users_summary
    assert "can_view_pending_approval_queue_item" not in pending_visibility
    assert "identity.primary_resource_id" in queue_projection
    assert "strict_governed_process_identity" in queue_projection
    assert "approval.id in governed_snapshot_access_ids" in queue_projection
    assert "def governed_process_response_policy(" in policy
    for endpoint in (detail, resolve):
        assert "governed_process_response_policy(" in endpoint
        assert "strict_governed_process_identity" not in endpoint
        assert "strict_extended_process_identity" not in endpoint
    assert "governed_process_response_policy(" in asset_projection
    assert "from app.core.permissions import can_resolve_approvals" not in asset_projection
    assert "_can_view_approval_notification" not in notification_visibility
    assert "visible_notification_clause" in notification_inbox


def _assert_terminal_state_owned_by_shared_module(source: str) -> None:
    tree = ast.parse(source)
    terminal_fields = {"status", "resolved_at", "resolved_by_id", "resolution_notes", "released_at", "release_reason"}
    for node in ast.walk(tree):
        targets = (
            node.targets
            if isinstance(node, ast.Assign)
            else [node.target]
            if isinstance(node, (ast.AnnAssign, ast.AugAssign))
            else []
        )
        for target in targets:
            assert not (
                isinstance(target, ast.Attribute)
                and isinstance(target.value, ast.Name)
                and target.value.id in {"approval", "impact_lock", "lock"}
                and target.attr in terminal_fields
            ), f"Direct terminal-state write at line {node.lineno} bypasses shared transition"
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            assert not (
                isinstance(node.func.value, ast.Name)
                and node.func.value.id == "OutboxService"
                and node.func.attr == "enqueue"
            )


@pytest.mark.parametrize(
    "filename",
    [
        "resolution.py",
        "resolution_extensions.py",
        "asset_resolution.py",
        "asset_resolution_policy.py",
        "vendor_resolution.py",
        "threat_resolution.py",
    ],
)
def test_adr_016_all_families_keep_terminal_state_in_shared_module(filename: str) -> None:
    source = (RESOLUTION_PATH.parent / filename).read_text(encoding="utf-8")
    _assert_terminal_state_owned_by_shared_module(source)


@pytest.mark.parametrize(
    "field", ["status", "resolved_at", "resolved_by_id", "resolution_notes", "released_at", "release_reason"]
)
def test_adr_016_terminal_ownership_guard_catches_seeded_bypass(field: str) -> None:
    source = RESOLUTION_PATH.read_text(encoding="utf-8")
    with pytest.raises(AssertionError, match="bypasses shared transition"):
        _assert_terminal_state_owned_by_shared_module(
            source + f"\ndef bypass(approval):\n    approval.{field} = None\n"
        )


def test_adr_016_cancellation_preserves_canonical_process_lock_path() -> None:
    source = RESOLUTION_PATH.read_text(encoding="utf-8")
    cancellation = source[source.index("async def cancel_governed_mutation(") : source.index("async def _reload(")]
    assert "context = await _load_governed_resolution(" in cancellation
    assert "select(Process)" not in cancellation


def test_adr_016_shared_loader_preserves_approval_proposal_sorted_impact_lock_prefix() -> None:
    source = (RESOLUTION_PATH.parent / "resolution_envelope.py").read_text(encoding="utf-8")
    loader = source[
        source.index("async def load_resolution_envelope("):source.index("async def reload_resolution_approval(")
    ]
    markers = ["select(ApprovalRequest)", "select(GovernedMutationProposal)", "select(GovernedMutationImpactLock)"]
    positions = [loader.index(marker) for marker in markers]
    assert positions == sorted(positions)
    assert loader.count(".with_for_update()") == 3
    assert loader.count(".execution_options(populate_existing=True)") == 3
    impact_order = loader[loader.index(".order_by("):loader.index(".with_for_update()", positions[-1])]
    assert impact_order.index("resource_type") < impact_order.index("resource_id") < impact_order.index("ImpactLock.id")
