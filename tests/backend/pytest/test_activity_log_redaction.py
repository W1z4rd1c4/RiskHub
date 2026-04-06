from app.core.activity_redaction import (
    DB_ACTIVITY_METADATA_POLICY,
    SIEM_ACTIVITY_METADATA_POLICY,
    sanitize_activity_metadata,
    sanitize_changes,
)


def test_sanitize_changes_redacts_sensitive_patterns_and_free_text() -> None:
    result = sanitize_changes(
        "user",
        {
            "email": {"old": "old@example.com", "new": "new@example.com"},
            "notes": {"old": "private", "new": "still private"},
            "session_token": {"old": "old-token", "new": "new-token"},
            "session_id": {"old": "session-old", "new": "session-new"},
            "authorization_id": {"old": "auth-old", "new": "auth-new"},
            "last_error": {"old": "old trace", "new": "new trace"},
            "result_json": {"old": {"detail": "old"}, "new": {"detail": "new"}},
        },
    )

    assert result.changes == {
        "email": {"old": "[REDACTED]", "new": "[REDACTED]"},
        "notes": {"old": "[REDACTED]", "new": "[REDACTED]"},
        "session_token": {"old": "[REDACTED]", "new": "[REDACTED]"},
        "session_id": {"old": "[REDACTED]", "new": "[REDACTED]"},
        "authorization_id": {"old": "[REDACTED]", "new": "[REDACTED]"},
        "last_error": {"old": "[REDACTED]", "new": "[REDACTED]"},
        "result_json": {"old": "[REDACTED]", "new": "[REDACTED]"},
    }
    assert result.visible_fields == ()


def test_sanitize_changes_keeps_safe_fields_only() -> None:
    result = sanitize_changes(
        "risk",
        {
            "status": {"old": "active", "new": "inactive"},
            "net_score": {"old": 4, "new": 7},
            "process": {"old": "Claims", "new": "Finance"},
            "mystery_field": {"old": "alpha", "new": "beta"},
        },
    )

    assert result.changes == {
        "status": {"old": "active", "new": "inactive"},
        "net_score": {"old": 4, "new": 7},
        "process": {"old": "Claims", "new": "Finance"},
        "mystery_field": {"old": "[REDACTED]", "new": "[REDACTED]"},
    }
    assert result.visible_fields == ("status", "net_score", "process")


def test_sanitize_changes_keeps_password_changed_but_hides_it_from_visible_fields() -> (
    None
):
    result = sanitize_changes(
        "user",
        {
            "password_changed": {"old": None, "new": True},
            "is_active": {"old": True, "new": False},
        },
    )

    assert result.changes == {
        "password_changed": {"old": None, "new": True},
        "is_active": {"old": True, "new": False},
    }
    assert result.visible_fields == ("is_active",)


def test_sanitize_changes_fails_closed_for_heuristic_names() -> None:
    result = sanitize_changes(
        "risk",
        {
            "device_id": {"old": "device-a", "new": "device-b"},
            "is_executive": {"old": False, "new": True},
            "name": {"old": "Sensitive Risk Name", "new": "Renamed Sensitive Risk"},
            "locked_by": {"old": "analyst@example.com", "new": "owner@example.com"},
            "risk_id_code": {"old": "R-100", "new": "R-101"},
        },
    )

    assert result.changes == {
        "device_id": {"old": "[REDACTED]", "new": "[REDACTED]"},
        "is_executive": {"old": "[REDACTED]", "new": "[REDACTED]"},
        "name": {"old": "[REDACTED]", "new": "[REDACTED]"},
        "locked_by": {"old": "[REDACTED]", "new": "[REDACTED]"},
        "risk_id_code": {"old": "R-100", "new": "R-101"},
    }
    assert result.visible_fields == ("risk_id_code",)


def test_sanitize_activity_metadata_splits_db_and_siem_policies() -> None:
    changes = sanitize_changes(
        "risk",
        {
            "risk_id_code": {"old": "R-100", "new": "R-101"},
            "description": {"old": "private", "new": "still private"},
        },
    )

    db_metadata = sanitize_activity_metadata(
        "risk",
        "update",
        raw_entity_name="Highly Sensitive Risk Name",
        raw_actor_name="Anna Kowalski",
        raw_description="Highly Sensitive Risk Name was updated",
        safe_description=None,
        safe_description_siem=None,
        safe_entity_label="R-101",
        sanitized_changes=changes,
        policy=DB_ACTIVITY_METADATA_POLICY,
    )
    siem_metadata = sanitize_activity_metadata(
        "risk",
        "update",
        raw_entity_name="Highly Sensitive Risk Name",
        raw_actor_name="Anna Kowalski",
        raw_description="Highly Sensitive Risk Name was updated",
        safe_description=None,
        safe_description_siem=None,
        safe_entity_label="R-101",
        sanitized_changes=changes,
        policy=SIEM_ACTIVITY_METADATA_POLICY,
    )

    assert db_metadata.entity_name == "R-101"
    assert db_metadata.actor_name == "Anna Kowalski"
    assert db_metadata.description == "Updated Risk (fields: risk_id_code)"
    assert set(db_metadata.redacted_fields) == {"entity_name", "description"}

    assert siem_metadata.entity_name == "Risk"
    assert siem_metadata.actor_name is None
    assert siem_metadata.description == "Updated Risk (fields: risk_id_code)"
    assert set(siem_metadata.redacted_fields) == {"entity_name", "actor_name", "description"}


def test_sanitize_activity_metadata_uses_db_safe_description_and_siem_template_by_default() -> None:
    changes = sanitize_changes(
        "risk",
        {
            "status": {"old": "archived", "new": "active"},
        },
    )

    db_metadata = sanitize_activity_metadata(
        "risk",
        "update",
        raw_entity_name="Highly Sensitive Risk Name",
        raw_actor_name="Anna Kowalski",
        raw_description="Restored highly sensitive risk R-101",
        safe_description="Restored risk",
        safe_description_siem=None,
        safe_entity_label="R-101",
        sanitized_changes=changes,
        policy=DB_ACTIVITY_METADATA_POLICY,
    )
    siem_metadata = sanitize_activity_metadata(
        "risk",
        "update",
        raw_entity_name="Highly Sensitive Risk Name",
        raw_actor_name="Anna Kowalski",
        raw_description="Restored highly sensitive risk R-101",
        safe_description="Restored risk",
        safe_description_siem=None,
        safe_entity_label="R-101",
        sanitized_changes=changes,
        policy=SIEM_ACTIVITY_METADATA_POLICY,
    )

    assert db_metadata.entity_name == "R-101"
    assert db_metadata.actor_name == "Anna Kowalski"
    assert db_metadata.description == "Restored risk"
    assert set(db_metadata.redacted_fields) == {"entity_name", "description"}

    assert siem_metadata.entity_name == "Risk"
    assert siem_metadata.actor_name is None
    assert siem_metadata.description == "Updated Risk (fields: status)"
    assert set(siem_metadata.redacted_fields) == {"entity_name", "actor_name", "description"}


def test_sanitize_activity_metadata_uses_safe_description_siem_when_provided() -> None:
    changes = sanitize_changes(
        "approval",
        None,
    )

    db_metadata = sanitize_activity_metadata(
        "approval",
        "cancel",
        raw_entity_name="Delete Approval",
        raw_actor_name="Anna Kowalski",
        raw_description="Approval request cancelled by Anna Kowalski (privileged)",
        safe_description="Approval request cancelled by Anna Kowalski (privileged)",
        safe_description_siem="Approval request cancelled by privileged user",
        safe_entity_label=None,
        sanitized_changes=changes,
        policy=DB_ACTIVITY_METADATA_POLICY,
    )
    siem_metadata = sanitize_activity_metadata(
        "approval",
        "cancel",
        raw_entity_name="Delete Approval",
        raw_actor_name="Anna Kowalski",
        raw_description="Approval request cancelled by Anna Kowalski (privileged)",
        safe_description="Approval request cancelled by Anna Kowalski (privileged)",
        safe_description_siem="Approval request cancelled by privileged user",
        safe_entity_label=None,
        sanitized_changes=changes,
        policy=SIEM_ACTIVITY_METADATA_POLICY,
    )

    assert db_metadata.entity_name == "Approval"
    assert db_metadata.actor_name == "Anna Kowalski"
    assert db_metadata.description == "Approval request cancelled by Anna Kowalski (privileged)"
    assert set(db_metadata.redacted_fields) == {"entity_name"}

    assert siem_metadata.entity_name == "Approval"
    assert siem_metadata.actor_name is None
    assert siem_metadata.description == "Approval request cancelled by privileged user"
    assert set(siem_metadata.redacted_fields) == {"entity_name", "actor_name", "description"}
