from app.core.activity_redaction import sanitize_changes


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


def test_sanitize_changes_keeps_password_changed_but_hides_it_from_visible_fields() -> None:
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
