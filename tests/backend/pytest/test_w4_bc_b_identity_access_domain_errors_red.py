from __future__ import annotations

import pytest

from app.core.config import Settings
from app.schemas import UserUpdate
from app.schemas.access import AccessUserUpdate
from app.schemas.directory import DirectoryImportRequest, DirectoryUserRead
from app.services._identity_access_lifecycle.access_scope import update_access_profile
from app.services._identity_access_lifecycle.directory_import import import_directory_identity
from app.services._identity_access_lifecycle.policy import ensure_sso_local_field_update_allowed
from app.services._identity_access_lifecycle.profile_updates import update_user_profile


def _settings() -> Settings:
    return Settings(secret_key="test-secret-key-32-chars-minimum-value", debug=True, mock_auth_enabled=True)


@pytest.mark.asyncio
async def test_access_profile_missing_user_raises_not_found_domain_error(db_session, test_user):
    from app.core.exceptions import NotFoundError

    with pytest.raises(NotFoundError) as exc_info:
        await update_access_profile(
            db=db_session,
            settings=_settings(),
            current_user=test_user,
            user_id=999_999,
            user_data=AccessUserUpdate(name="Missing User"),
        )

    assert exc_info.value.detail == "User not found"


@pytest.mark.asyncio
async def test_user_profile_invalid_role_raises_validation_domain_error(db_session, test_user, test_user_employee):
    from app.core.exceptions import ValidationError

    with pytest.raises(ValidationError) as exc_info:
        await update_user_profile(
            db=db_session,
            settings=_settings(),
            current_user=test_user,
            user_id=test_user_employee.id,
            user_data=UserUpdate(role_id=999_999),
        )

    assert exc_info.value.detail == "Invalid role_id"


def test_sso_managed_field_raises_authorization_domain_error(test_user):
    from app.core.exceptions import AuthorizationError

    test_user.external_id = "external-user"
    with pytest.raises(AuthorizationError) as exc_info:
        ensure_sso_local_field_update_allowed(
            settings=Settings(
                secret_key="test-secret-key-32-chars-minimum-value",
                debug=True,
                auth_mode="microsoft_sso",
            ),
            user=test_user,
            update_data={"name": "Directory Managed"},
            fields={"name"},
        )

    assert exc_info.value.detail == "name is managed by directory sync for SSO-linked users."


@pytest.mark.asyncio
async def test_directory_import_missing_email_raises_validation_domain_error(db_session, test_user):
    from app.core.exceptions import ValidationError

    directory_user = DirectoryUserRead(
        external_id="oid-missing-email",
        email=None,
        user_principal_name=None,
        display_name="Missing Email",
        account_enabled=True,
        source="ad_emulator",
    )
    payload = DirectoryImportRequest()

    with pytest.raises(ValidationError) as exc_info:
        await import_directory_identity(
            db=db_session,
            settings=_settings(),
            current_user=test_user,
            directory_user=directory_user,
            payload=payload,
            provider_name="pytest",
        )

    assert exc_info.value.detail == "Directory user is missing an importable email address"
