"""#251: account field ownership and exact deployment context at public seams."""

import pytest

from app.core.security import get_password_hash
from app.services import _identity_authority_lock
from app.services._auth_session import refresh as refresh_service
from tests.backend.pytest.test_identity_foundations import identity_settings


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/api/v1/access/users", "/api/v1/access/users/my-department"])
async def test_directory_field_ownership_is_independent_of_visible_reader_authority(
    db_session, client_factory, test_user, test_user_cro, test_user_employee, path
):
    target = test_user_employee
    target.external_id = "ownership-directory-target"
    await db_session.commit()
    settings = identity_settings(mock_auth_enabled=True)
    rows = []
    for actor in (test_user, test_user_cro):
        query = f"?department_id={target.department_id}" if path.endswith("my-department") else ""
        async with client_factory(user=actor, settings=settings) as client:
            response = await client.get(path + query)
            assert response.status_code == 200, response.text
            row = next(row for row in response.json() if row["id"] == target.id)
            rows.append(row)
    expected = ["email", "entra_business_role", "external_id", "job_title", "name"]
    assert rows[0]["capabilities"]["directory_owned_fields"] == expected
    assert rows[1]["capabilities"]["directory_owned_fields"] == expected
    assert not rows[1]["capabilities"]["can_edit_identity"]
    assert rows[1]["capabilities"]["can_edit_business_access"]


@pytest.mark.asyncio
async def test_refresh_passes_request_settings_to_both_real_eligibility_checks(
    db_session, client_factory, test_user_employee, monkeypatch
):
    target = test_user_employee
    target.hashed_password = get_password_hash("Ownership test password 251")
    await db_session.commit()
    settings = identity_settings(auth_mode="password", mock_auth_enabled=True)
    seen = []
    original = refresh_service.can_authenticate_user

    def observe(user, *, settings=None):
        seen.append(settings)
        return original(user, settings=settings)

    monkeypatch.setattr(refresh_service, "can_authenticate_user", observe)
    async with client_factory(settings=settings) as client:
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": target.email, "password": "Ownership test password 251"},
            headers={"Origin": "http://test"},
        )
        assert login.status_code == 200, login.text
        refreshed = await client.post(
            "/api/v1/auth/refresh",
            headers={"Origin": "http://test", "X-CSRF-Token": client.cookies["riskhub_csrf_token"]},
        )
        assert refreshed.status_code == 200, refreshed.text
    assert len(seen) == 2
    assert all(item is settings for item in seen)


@pytest.mark.asyncio
@pytest.mark.parametrize("adapter", ["users", "access/users"])
async def test_locked_actor_eligibility_receives_request_settings(
    client_factory, test_user, test_user_employee, monkeypatch, adapter
):
    settings = identity_settings(mock_auth_enabled=True)
    seen = []
    original = _identity_authority_lock.can_authenticate_user

    def observe(user, *, settings=None):
        seen.append(settings)
        return original(user, settings=settings)

    monkeypatch.setattr(_identity_authority_lock, "can_authenticate_user", observe)
    async with client_factory(user=test_user, settings=settings) as client:
        updated = await client.patch(
            f"/api/v1/{adapter}/{test_user_employee.id}", json={"name": "Authorized unchanged owner policy"}
        )
        assert updated.status_code == 200, updated.text
    assert seen and all(item is settings for item in seen)


@pytest.mark.parametrize(
    "mode,provider,linked,directory,credential",
    [
        ("microsoft_sso", "graph", True, {"name", "email", "job_title", "entra_business_role", "external_id"}, set()),
        ("microsoft_sso", "graph", False, set(), set()),
        ("password", "none", False, set(), {"email"}),
        ("password", "none", True, set(), {"email"}),
        ("password", "graph", False, set(), set()),
        ("hybrid_dev", "graph", True, set(), set()),
    ],
)
def test_identity_ownership_table(mode, provider, linked, directory, credential):
    from types import SimpleNamespace

    from app.core.identity_field_ownership import identity_field_owners

    settings = identity_settings(auth_mode=mode, directory_provider=provider)
    owners = identity_field_owners(
        settings=settings, user=SimpleNamespace(external_id="directory-id" if linked else None)
    )
    assert set(owners) == {"name", "email", "job_title", "entra_business_role", "external_id"}
    assert {field for field, owner in owners.items() if owner == "directory"} == directory
    assert {field for field, owner in owners.items() if owner == "credential_workflow"} == credential
    assert {field for field, owner in owners.items() if owner == "administrator"} == set(
        owners
    ) - directory - credential


@pytest.mark.asyncio
@pytest.mark.parametrize("adapter", ["users", "access/users"])
@pytest.mark.parametrize("native", [False, True])
async def test_owned_fields_denied_and_unchanged_values_preserved(
    db_session, client_factory, test_user, test_user_employee, adapter, native
):
    target = test_user_employee
    target.external_id = None if native else "ownership-linked-user"
    target.local_enrollment_state = "enrolled"
    test_user.local_enrollment_state = "enrolled"
    await db_session.commit()
    settings = identity_settings(
        auth_mode="password" if native else "microsoft_sso",
        directory_provider="none" if native else "graph",
        mock_auth_enabled=True,
    )
    version, original_name, original_email = target.token_version, target.name, target.email
    async with client_factory(user=test_user, settings=settings) as client:
        listed = await client.get("/api/v1/access/users")
        assert listed.status_code == 200, listed.text
        row = next(row for row in listed.json() if row["id"] == target.id)
        assert row["capabilities"]["verified_identity_fields"] == (["email"] if native else [])
        fields = {"email": "different-owner@example.com"}
        if not native:
            fields["name"] = "Unauthorized upstream name"
        for field, value in fields.items():
            response = await client.patch(f"/api/v1/{adapter}/{target.id}", json={field: value})
            assert response.status_code == 403, response.text
        await db_session.refresh(target)
        assert (target.name, target.email, target.token_version) == (original_name, original_email, version)
        unchanged = await client.patch(
            f"/api/v1/{adapter}/{target.id}", json={"email": original_email, "name": original_name}
        )
        assert unchanged.status_code == 200, unchanged.text
        await db_session.refresh(target)
        assert target.token_version == version
        if native:
            changed = await client.patch(f"/api/v1/{adapter}/{target.id}", json={"name": "Allowed local name"})
            assert changed.status_code == 200, changed.text
            assert changed.json()["name"] == "Allowed local name"
            if adapter == "access/users":
                assert changed.json()["capabilities"]["verified_identity_fields"] == ["email"]


@pytest.mark.parametrize(
    "debug,mode,expected", [(False, "password", False), (True, "password", True), (False, "microsoft_sso", True)]
)
def test_exact_eligibility_context_preserves_existing_null_enrollment_policy(debug, mode, expected):
    from app.core.identity_policy import can_authenticate_user
    from app.models import User

    target = User(is_active=True, local_suspended=False, local_recovery_pending=False, restore_quarantined=False)
    settings = identity_settings(debug=debug, auth_mode=mode)
    assert can_authenticate_user(target, settings=settings) is expected
