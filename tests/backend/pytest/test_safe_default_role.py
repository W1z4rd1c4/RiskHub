from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import _shared as auth_shared
from app.core.exceptions import ServiceFailure
from app.services._auth_session import jit
from app.services._identity_access_lifecycle import directory_import

REPO_ROOT = Path(__file__).resolve().parents[3]
EXPECTED_MESSAGE = "No safe default role found (employee, control_owner, viewer). Seed roles first."


@pytest.mark.asyncio
async def test_safe_default_role_missing_contracts_preserve_caller_exception_types(db_session: AsyncSession) -> None:
    with pytest.raises(RuntimeError, match="No safe default role found"):
        await jit._resolve_safe_default_role(db_session)

    with pytest.raises(ServiceFailure, match="No safe default role found"):
        await directory_import.resolve_safe_default_role(db_session)

    with pytest.raises(HTTPException) as exc_info:
        await auth_shared._resolve_safe_default_role(db_session)

    assert exc_info.value.status_code == 500
    assert exc_info.value.detail == EXPECTED_MESSAGE


def test_safe_default_role_callers_use_shared_helper() -> None:
    paths = (
        REPO_ROOT / "backend/app/services/_auth_session/jit.py",
        REPO_ROOT / "backend/app/services/_identity_access_lifecycle/directory_import.py",
        REPO_ROOT / "backend/app/api/v1/endpoints/auth/_shared.py",
    )

    for path in paths:
        source = path.read_text(encoding="utf-8")
        assert "SAFE_DIRECTORY_DEFAULT_ROLE_CANDIDATES" not in source
        assert "select(Role).where(Role.name == name)" not in source
        assert "resolve_safe_default_role(" in source
