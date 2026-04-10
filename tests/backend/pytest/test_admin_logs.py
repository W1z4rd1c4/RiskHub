"""Tests for admin log endpoints."""

import json
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.logging import tail_log_file
from app.models.global_config import GlobalConfig


class TestTailLogFile:
    """Tests for the tail_log_file helper function."""

    def test_tail_empty_file(self, tmp_path):
        """Test tailing an empty file."""
        log_file = tmp_path / "empty.log"
        log_file.write_text("")

        lines, total = tail_log_file(log_file, 10)
        assert lines == []
        assert total == 0

    def test_tail_nonexistent_file(self, tmp_path):
        """Test tailing a nonexistent file."""
        log_file = tmp_path / "nonexistent.log"

        lines, total = tail_log_file(log_file, 10)
        assert lines == []
        assert total == 0

    def test_tail_small_file(self, tmp_path):
        """Test tailing a file with fewer lines than requested."""
        log_file = tmp_path / "small.log"
        log_file.write_text('{"event": "line1"}\n{"event": "line2"}\n{"event": "line3"}\n')

        lines, total = tail_log_file(log_file, 10)
        assert len(lines) == 3
        assert all("line" in line for line in lines)

    def test_tail_exact_count(self, tmp_path):
        """Test tailing exactly N lines from a larger file."""
        log_file = tmp_path / "larger.log"
        content = "\n".join([f'{{"event": "line{i}"}}' for i in range(20)]) + "\n"
        log_file.write_text(content)

        lines, total = tail_log_file(log_file, 5)
        assert len(lines) == 5
        # Should be the last 5 lines
        for i, line in enumerate(lines):
            data = json.loads(line)
            assert data["event"] == f"line{15 + i}"

    def test_tail_handles_malformed_lines(self, tmp_path):
        """Test that tail returns lines even if some are malformed."""
        log_file = tmp_path / "mixed.log"
        log_file.write_text('{"event": "good1"}\nmalformed line\n{"event": "good2"}\n')

        lines, total = tail_log_file(log_file, 10)
        # Should return all non-empty lines
        assert len(lines) >= 2

    # Note: Full integration tests for admin log endpoints would require
    # database fixtures and proper authentication setup. The core functionality
    # is covered by TestTailLogFile tests above.


@pytest.mark.asyncio
async def test_admin_log_config_get_returns_canonical_shape(auth_client: AsyncClient):
    response = await auth_client.get("/api/v1/admin/logs/config")
    assert response.status_code == 200
    data = response.json()
    assert set(data.keys()) == {
        "app_log_rotation_size_mb",
        "app_log_retention_count",
        "audit_log_rotation_size_mb",
        "audit_log_retention_count",
    }


@pytest.mark.asyncio
async def test_admin_log_config_update_accepts_canonical_payload(
    auth_client: AsyncClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    configure_mock = MagicMock()
    monkeypatch.setattr("app.api.v1.endpoints.admin.log_config.reconfigure_log_rotation", configure_mock)

    payload = {
        "app_log_rotation_size_mb": 12,
        "app_log_retention_count": 9,
        "audit_log_rotation_size_mb": 20,
        "audit_log_retention_count": 15,
    }
    response = await auth_client.post("/api/v1/admin/logs/config", json=payload)
    assert response.status_code == 200
    assert response.json() == payload

    result = await db_session.execute(
        select(GlobalConfig).where(
            GlobalConfig.key.in_(
                [
                    "app_log_rotation_size_mb",
                    "app_log_retention_count",
                    "audit_log_rotation_size_mb",
                    "audit_log_retention_count",
                ]
            )
        )
    )
    values = {cfg.key: cfg.value for cfg in result.scalars().all()}
    assert values == {
        "app_log_rotation_size_mb": "12",
        "app_log_retention_count": "9",
        "audit_log_rotation_size_mb": "20",
        "audit_log_retention_count": "15",
    }
    configure_mock.assert_called_once_with(
        app_rotation_size_mb=12,
        app_retention_count=9,
        audit_rotation_size_mb=20,
        audit_retention_count=15,
    )


@pytest.mark.asyncio
async def test_admin_log_config_get_reflects_updated_values_after_cache_warm(
    auth_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    from app.models.global_config import clear_config_cache

    clear_config_cache()
    configure_mock = MagicMock()
    monkeypatch.setattr("app.api.v1.endpoints.admin.log_config.reconfigure_log_rotation", configure_mock)

    initial = await auth_client.get("/api/v1/admin/logs/config")
    assert initial.status_code == 200

    payload = {
        "app_log_rotation_size_mb": 16,
        "app_log_retention_count": 12,
        "audit_log_rotation_size_mb": 24,
        "audit_log_retention_count": 18,
    }
    updated = await auth_client.post("/api/v1/admin/logs/config", json=payload)
    assert updated.status_code == 200

    reread = await auth_client.get("/api/v1/admin/logs/config")
    assert reread.status_code == 200
    assert reread.json() == payload
    clear_config_cache()


@pytest.mark.asyncio
async def test_admin_log_config_update_accepts_legacy_payload_and_mirrors(
    auth_client: AsyncClient,
    db_session,
):
    payload = {"log_rotation_size_mb": 8, "log_retention_count": 6}
    response = await auth_client.post("/api/v1/admin/logs/config", json=payload)
    assert response.status_code == 200
    assert response.json() == {
        "app_log_rotation_size_mb": 8,
        "app_log_retention_count": 6,
        "audit_log_rotation_size_mb": 8,
        "audit_log_retention_count": 6,
    }

    result = await db_session.execute(
        select(GlobalConfig).where(
            GlobalConfig.key.in_(
                [
                    "app_log_rotation_size_mb",
                    "app_log_retention_count",
                    "audit_log_rotation_size_mb",
                    "audit_log_retention_count",
                ]
            )
        )
    )
    values = {cfg.key: cfg.value for cfg in result.scalars().all()}
    assert values == {
        "app_log_rotation_size_mb": "8",
        "app_log_retention_count": "6",
        "audit_log_rotation_size_mb": "8",
        "audit_log_retention_count": "6",
    }


@pytest.mark.asyncio
async def test_admin_log_config_update_rejects_mixed_payload(auth_client: AsyncClient):
    response = await auth_client.post(
        "/api/v1/admin/logs/config",
        json={
            "app_log_rotation_size_mb": 12,
            "app_log_retention_count": 9,
            "audit_log_rotation_size_mb": 20,
            "audit_log_retention_count": 15,
            "log_rotation_size_mb": 8,
            "log_retention_count": 6,
        },
    )
    assert response.status_code == 422
    assert "canonical app/audit fields or legacy log_* fields" in response.text


def _make_log_config(key: str, value: str) -> GlobalConfig:
    return GlobalConfig(
        key=key,
        value=value,
        value_type="int",
        category="system",
        display_name=key,
        description=key,
        min_value=1,
        max_value=500,
        is_editable=True,
    )


@pytest.mark.asyncio
async def test_apply_persisted_log_rotation_config_uses_persisted_values(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    from app.main import apply_persisted_log_rotation_config
    from app.models.global_config import clear_config_cache

    clear_config_cache()
    configure_mock = MagicMock()
    monkeypatch.setattr("app.main.reconfigure_log_rotation", configure_mock)
    db_session.add_all(
        [
            _make_log_config("app_log_rotation_size_mb", "21"),
            _make_log_config("app_log_retention_count", "17"),
            _make_log_config("audit_log_rotation_size_mb", "13"),
            _make_log_config("audit_log_retention_count", "11"),
        ]
    )
    await db_session.commit()

    resolved = await apply_persisted_log_rotation_config(db_session)

    assert resolved == {
        "app_log_rotation_size_mb": 21,
        "app_log_retention_count": 17,
        "audit_log_rotation_size_mb": 13,
        "audit_log_retention_count": 11,
    }
    configure_mock.assert_called_once_with(
        app_rotation_size_mb=21,
        app_retention_count=17,
        audit_rotation_size_mb=13,
        audit_retention_count=11,
    )
    clear_config_cache()


@pytest.mark.asyncio
async def test_apply_persisted_log_rotation_config_falls_back_to_defaults_for_invalid_values(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
):
    from app.main import apply_persisted_log_rotation_config
    from app.models.global_config import clear_config_cache

    clear_config_cache()
    configure_mock = MagicMock()
    monkeypatch.setattr("app.main.reconfigure_log_rotation", configure_mock)
    db_session.add_all(
        [
            _make_log_config("app_log_rotation_size_mb", "invalid"),
            _make_log_config("app_log_retention_count", "9"),
            _make_log_config("audit_log_rotation_size_mb", "0"),
        ]
    )
    await db_session.commit()

    resolved = await apply_persisted_log_rotation_config(db_session)

    assert resolved == {
        "app_log_rotation_size_mb": 10,
        "app_log_retention_count": 9,
        "audit_log_rotation_size_mb": 10,
        "audit_log_retention_count": 10,
    }
    configure_mock.assert_called_once_with(
        app_rotation_size_mb=10,
        app_retention_count=9,
        audit_rotation_size_mb=10,
        audit_retention_count=10,
    )
    clear_config_cache()


@pytest.mark.asyncio
async def test_admin_log_config_endpoints_reject_non_admin(client_cro: AsyncClient):
    get_response = await client_cro.get("/api/v1/admin/logs/config")
    assert get_response.status_code == 403

    post_response = await client_cro.post(
        "/api/v1/admin/logs/config",
        json={
            "app_log_rotation_size_mb": 12,
            "app_log_retention_count": 9,
            "audit_log_rotation_size_mb": 20,
            "audit_log_retention_count": 15,
        },
    )
    assert post_response.status_code == 403
