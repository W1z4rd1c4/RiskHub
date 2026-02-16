import json
from pathlib import Path

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_audit_log_on_failed_login(client: AsyncClient):
    """
    Verify that a failed login attempt triggers a structured audit log entry.
    """
    # Identify the audit log path
    # Path is relative to backend root: logs/audit.json.log
    backend_dir = Path(__file__).parent.parent
    audit_log_path = backend_dir / "logs" / "audit.json.log"

    # Ensure directory exists (it should if logging was configured)
    audit_log_path.parent.mkdir(exist_ok=True)

    # Get initial log size or content to find the NEW log entry
    initial_log_lines = []
    if audit_log_path.exists():
        with open(audit_log_path, "r") as f:
            initial_log_lines = f.readlines()

    # 1. Trigger the event: Failed login
    payload = {"email": "nonexistent@test.com", "password": "wrongpassword"}
    response = await client.post("/api/v1/auth/login", json=payload)

    # Assert API responded with failure
    assert response.status_code == 401

    # 2. Verify the log entry
    # Give it a small moment if needed (usually synchronous in these tests but good to be safe)
    assert audit_log_path.exists(), "Audit log file should exist"

    with open(audit_log_path, "r") as f:
        current_log_lines = f.readlines()

    # The new entry should be at the end
    assert len(current_log_lines) > len(initial_log_lines), "New audit log entry should be added"

    last_line = current_log_lines[-1].strip()
    log_entry = json.loads(last_line)

    # 3. Verify SIEM required fields
    required_fields = ["timestamp", "level", "event", "logger", "feature"]
    for field in required_fields:
        assert field in log_entry, f"SIEM required field '{field}' missing from audit log"

    # Verify content
    assert log_entry["event"] == "failed_login"
    assert "Failed login attempt" in log_entry["description"]
    assert log_entry["feature"] == "audit"
    assert log_entry["logger"] == "audit"

    # Verify context fields (might be null in unauthenticated login but keys should exist if middleware works)
    # Actually, failure happens before user is loaded, so user_id might be missing or null
    assert "request_id" in log_entry, "request_id should be present"
    assert "client_ip" in log_entry, "client_ip should be present"


@pytest.mark.asyncio
async def test_audit_log_schema_integrity(client: AsyncClient):
    """
    Verify that audit logs follow a valid JSON schema for ingestion.
    """
    backend_dir = Path(__file__).parent.parent
    audit_log_path = backend_dir / "logs" / "audit.json.log"

    if not audit_log_path.exists():
        pytest.skip("Audit log file does not exist yet")

    with open(audit_log_path, "r") as f:
        lines = f.readlines()

    if not lines:
        pytest.skip("Audit log is empty")

    # Check the latest 5 entries for consistency
    for line in lines[-5:]:
        if not line.strip():
            continue
        entry = json.loads(line)
        assert isinstance(entry, dict)
        assert "timestamp" in entry
        assert "level" in entry
        assert "event" in entry
        # ISO timestamp check
        from datetime import datetime

        try:
            datetime.fromisoformat(entry["timestamp"].replace("Z", "+00:00"))
        except ValueError:
            pytest.fail(f"Invalid ISO timestamp: {entry['timestamp']}")
