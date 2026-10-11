"""Factor-policy boundary evidence; invalid contexts bypass Settings deliberately."""

from dataclasses import replace

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.datetime_utils import utc_now
from app.core.security import get_password_hash
from app.schemas.local_auth import RecentAuthenticationRequest
from app.services._local_auth import enrollment, factors
from app.services._local_auth.artifacts import issue_grant
from app.services._local_auth.common import build_context

PASSWORD = "A distinct local passphrase 74!"
NEW_PASSWORD = "Another independent passphrase 93!"


def test_normal_settings_reject_unknown_mfa_policy():
    with pytest.raises(ValidationError):
        Settings(local_mfa_policy="unexpected")


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["recent", "proof", "enrollment"])
async def test_invalid_context_policy_cannot_complete_without_factor(native_context, db_session, test_user, operation):
    from app.main import app

    native_context.local_mfa_policy = "optional"
    test_user.local_enrollment_state = "invited" if operation == "enrollment" else "enrolled"
    test_user.local_email_verified_at = utc_now()
    test_user.hashed_password = get_password_hash(PASSWORD)
    await db_session.commit()
    ctx = await build_context(db_session, settings=native_context, redis=app.state.redis, source="policy-test")
    # Normal construction rejects this value. Exercise the module's promised
    # defensive boundary with a deliberately invalid service context, not a public bypass.
    invalid = replace(ctx, settings=native_context.model_copy(update={"local_mfa_policy": "unexpected"}))
    data = RecentAuthenticationRequest(
        password=PASSWORD, target_user_id=test_user.id, operation="password_change", intended_password=NEW_PASSWORD
    )
    if operation == "proof":
        proof = await factors.recent_authentication(db_session, ctx, test_user, data, browser="policy-browser")
        with pytest.raises(ValueError, match="MFA policy"):
            await factors.check_recent_proof(
                db_session, invalid, test_user, raw=proof.proof, operation="password_change",
                value=NEW_PASSWORD, browser="policy-browser"
            )
    elif operation == "recent":
        with pytest.raises(ValueError, match="MFA policy"):
            await factors.recent_authentication(db_session, invalid, test_user, data, browser="policy-browser")
    else:
        _, raw = await issue_grant(db_session, ctx, test_user, "invite", 3600)
        await db_session.commit()
        with pytest.raises(ValueError, match="MFA policy"):
            await enrollment.start_enrollment(db_session, invalid, raw=raw, password=PASSWORD, browser="policy-browser")
        await db_session.refresh(test_user)
        assert test_user.local_enrollment_state == "invited"


@pytest.mark.parametrize("policy", ["required", "optional", "unexpected"])
@pytest.mark.parametrize("factor_state", ["absent", "unconfirmed", "confirmed"])
@pytest.mark.parametrize("enrollment_state", ["invited", "password_set", "enrolled", "unknown"])
def test_factor_policy_truth_table_is_separate_from_readiness(policy, factor_state, enrollment_state):
    from types import SimpleNamespace

    from app.services._local_auth.common import local_user_ready
    from app.services._local_auth.factor_policy import evaluate_factor_policy

    factor = None if factor_state == "absent" else SimpleNamespace(
        confirmed_at=utc_now() if factor_state == "confirmed" else None
    )
    if policy == "unexpected":
        with pytest.raises(ValueError, match="MFA policy"):
            evaluate_factor_policy(policy, factor)
        return
    answer = evaluate_factor_policy(policy, factor)
    assert answer.confirmed == (factor_state == "confirmed")
    assert answer.required == (policy == "required" or factor_state == "confirmed")
    assert answer.enrollment_completes_without_factor == (policy == "optional" and factor_state != "confirmed")
    assert answer.satisfied == (policy == "optional" or factor_state == "confirmed")
    user = SimpleNamespace(
        external_id=None, restore_quarantined=False, local_suspended=False,
        local_recovery_pending=False, local_email_verified_at=utc_now(),
        local_enrollment_state=enrollment_state, is_active=True,
    )
    assert local_user_ready(user) == (enrollment_state == "enrolled")
    user.local_recovery_pending = True
    assert not local_user_ready(user)
