from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.contract

ROOT = Path(__file__).resolve().parents[4]
ADR_PATH = ROOT / "docs/adr/ADR-016-governed-mutation-proposals.md"
RESOLUTION_PATH = (
    ROOT / "backend/app/services/_governed_mutations/resolution.py"
)
POLICY_PATH = ROOT / "backend/app/services/approval_scenario_policy.py"
PROCESS_IDENTITY_PATH = (
    ROOT / "backend/app/services/_governed_mutations/process_identity.py"
)
QUEUE_QUERY_PATH = ROOT / "backend/app/services/_approval_queue/queries.py"
QUEUE_COUNT_PATH = ROOT / "backend/app/services/_approval_queue/counts.py"
PENDING_VISIBILITY_PATH = (
    ROOT / "backend/app/services/approval_queue_visibility.py"
)
QUEUE_PROJECTION_PATH = (
    ROOT / "backend/app/services/_approval_queue/projection.py"
)
USERS_SUMMARY_PATH = ROOT / "backend/app/api/v1/endpoints/users/summary.py"
DETAIL_PATH = ROOT / "backend/app/api/v1/endpoints/approvals/detail.py"
NOTIFICATION_VISIBILITY_PATH = (
    ROOT / "backend/app/services/notification_visibility.py"
)
NOTIFICATION_INBOX_PATH = (
    ROOT / "backend/app/services/_notification_inbox/lifecycle.py"
)


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

    assert "requester, resolver, and proposed-owner Role rows ordered by Role ID" in adr
    assert "requester-permission update versus approval races" in adr
    assert "proposed-owner role\nassignment versus approval races" in adr
    assert "resolver scope/department updates versus\napproval races" in adr
    assert "manager links\nare verified unchanged after locking" in adr
    assert "def _governed_envelope_stale_reason(" in resolution
    assert "if len(impact_locks) != 1:" in resolution
    assert "manager_snapshot = {row.id: row.manager_id" in resolution
    assert "can_resolve_process_approval(" in resolution
    role_lock = resolution.index(".where(Role.id.in_(reference_role_ids))")
    process_lock = resolution.index(".where(Process.id == process_id)", role_lock)
    assert role_lock < process_lock


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
    notification_visibility = NOTIFICATION_VISIBILITY_PATH.read_text(
        encoding="utf-8"
    )
    notification_inbox = NOTIFICATION_INBOX_PATH.read_text(encoding="utf-8")

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
    assert "is_governed_process_approval" in detail
    assert "strict_governed_process_identity" in detail
    assert "_can_view_approval_notification" not in notification_visibility
    assert "visible_notification_clause" in notification_inbox
