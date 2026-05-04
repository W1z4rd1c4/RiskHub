from __future__ import annotations

from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.activity_logger import audit_logger
from app.core.datetime_utils import coerce_utc, utc_now
from app.core.tokens import token_decode_or_none
from app.core.user_query_options import user_selectinload_options
from app.models import RefreshToken, User
from app.models.activity_log import ActivityAction, ActivityEntityType

from .audit import record_session_audit_plan
from .contracts import (
    SESSION_RENEWAL_MINIMUM_SECONDS,
    RefreshSessionOutcome,
    RefreshSessionResolution,
    RefreshStatus,
    SessionAuditPlan,
    SessionCookiePlan,
    refresh_session_context_outcome,
)


def _failed_refresh_outcome(
    status_value: RefreshStatus,
    *,
    failure_code: str,
    revoke_count: int = 0,
) -> RefreshSessionOutcome:
    return RefreshSessionOutcome(
        status=status_value,
        cookie_plan=SessionCookiePlan(action="clear_refresh"),
        audit_plan=SessionAuditPlan(
            event_type=ActivityAction.FAILED_REFRESH.value,
            failure_code=failure_code,
            revoke_count=revoke_count,
        ),
    )


def _emit_failed_refresh_audit(
    *,
    failure_code: str,
    detail: str,
    user_id: int | None = None,
) -> None:
    audit_logger.warning(
        "failed_refresh",
        feature="audit",
        event_type=ActivityAction.FAILED_REFRESH.value,
        entity_type=ActivityEntityType.USER.value,
        entity_id=user_id,
        actor_id=user_id,
        description="User refresh failed",
        changes={"failure_code": failure_code},
        detail=detail,
    )


async def _load_refresh_user(db: AsyncSession, user_id: int) -> User | None:
    return (
        await db.execute(
            select(User)
            .options(*user_selectinload_options(include_permissions=True))
            .where(User.id == user_id)
        )
    ).scalar_one_or_none()


async def revoke_rotated_refresh_descendants(
    *,
    db: AsyncSession,
    user_id: int,
    replaced_by_jti: str | None,
    now: datetime,
) -> int:
    revoke_count = 0
    next_jti = replaced_by_jti
    visited: set[str] = set()
    while next_jti and next_jti not in visited:
        visited.add(next_jti)
        child = (
            await db.execute(
                select(RefreshToken)
                .where(RefreshToken.user_id == user_id)
                .where(RefreshToken.jti == next_jti)
            )
        ).scalar_one_or_none()
        if child is None:
            break
        next_jti = child.replaced_by_jti
        if child.revoked_at is None:
            child.revoked_at = now
            child.revoked_reason = "replay_detected"
            db.add(child)
            revoke_count += 1
    return revoke_count


async def _record_failed_refresh(
    *,
    db: AsyncSession,
    user: User | None,
    failure_code: str,
    revoke_count: int,
) -> None:
    if user is None:
        return
    await record_session_audit_plan(
        db=db,
        user=user,
        plan=SessionAuditPlan(
            event_type=ActivityAction.FAILED_REFRESH.value,
            failure_code=failure_code,
            revoke_count=revoke_count,
        ),
    )
    await db.commit()


async def _revoke_refresh_row(
    *,
    db: AsyncSession,
    refresh_row: RefreshToken,
    now: datetime,
    reason: str,
) -> int:
    revoke_result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.id == refresh_row.id)
        .where(RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now, revoked_reason=reason)
    )
    return int(getattr(revoke_result, "rowcount", 0) or 0)


async def resolve_refresh_session(
    *,
    db: AsyncSession,
    raw_token: str | None,
    settings,
    current_ip: str | None,
    current_user_agent: str | None,
) -> RefreshSessionResolution:
    payload = token_decode_or_none(raw_token, settings)
    if not payload:
        _emit_failed_refresh_audit(failure_code="invalid_token", detail="Invalid refresh token")
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome("invalid_token", failure_code="invalid_token"),
            detail="Invalid refresh token",
        )

    user_id = payload.get("user_id")
    jti = payload.get("jti")
    token_version = payload.get("token_version")
    if not isinstance(user_id, int) or not isinstance(jti, str) or not isinstance(token_version, int):
        _emit_failed_refresh_audit(failure_code="invalid_token", detail="Invalid refresh token")
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome("invalid_token", failure_code="invalid_token"),
            detail="Invalid refresh token",
        )

    refresh_row = (
        await db.execute(select(RefreshToken).where(RefreshToken.user_id == user_id).where(RefreshToken.jti == jti))
    ).scalar_one_or_none()
    if refresh_row is None or refresh_row.revoked_at is not None:
        failure_code = "session_not_found"
        revoke_count = 0
        if refresh_row is not None and refresh_row.revoked_reason == "rotated":
            now = utc_now()
            revoke_count = await revoke_rotated_refresh_descendants(
                db=db,
                user_id=user_id,
                replaced_by_jti=refresh_row.replaced_by_jti,
                now=now,
            )
            if revoke_count > 0:
                user = await _load_refresh_user(db, user_id)
                await _record_failed_refresh(
                    db=db,
                    user=user,
                    failure_code="replay_detected",
                    revoke_count=revoke_count,
                )
                failure_code = "replay_detected"
        _emit_failed_refresh_audit(
            failure_code=failure_code,
            detail="Refresh session not found",
            user_id=user_id,
        )
        status_value: RefreshStatus = "replay_detected" if revoke_count else "session_not_found"
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome(status_value, failure_code=failure_code),
            detail="Refresh session not found",
            user_id=user_id,
            jti=jti,
        )

    now = utc_now()
    expires_at = coerce_utc(refresh_row.expires_at)
    if expires_at and expires_at <= now:
        revoke_count = await _revoke_refresh_row(db=db, refresh_row=refresh_row, now=now, reason="expired")
        if revoke_count > 0:
            await _record_failed_refresh(
                db=db,
                user=await _load_refresh_user(db, user_id),
                failure_code="expired",
                revoke_count=revoke_count,
            )
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome("expired", failure_code="expired", revoke_count=revoke_count),
            detail="Refresh token expired",
            user_id=user_id,
            jti=jti,
        )
    if expires_at and (expires_at - now).total_seconds() <= SESSION_RENEWAL_MINIMUM_SECONDS:
        revoke_count = await _revoke_refresh_row(db=db, refresh_row=refresh_row, now=now, reason="expires_soon")
        if revoke_count > 0:
            await _record_failed_refresh(
                db=db,
                user=await _load_refresh_user(db, user_id),
                failure_code="expires_soon",
                revoke_count=revoke_count,
            )
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome("expires_soon", failure_code="expires_soon", revoke_count=revoke_count),
            detail="Refresh token expired",
            user_id=user_id,
            jti=jti,
        )

    user = await _load_refresh_user(db, user_id)
    if user is None:
        _emit_failed_refresh_audit(failure_code="unauthorized", detail="Unauthorized", user_id=user_id)
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome("session_not_found", failure_code="unauthorized"),
            detail="Unauthorized",
            user_id=user_id,
            jti=jti,
        )
    if not user.is_active:
        await _record_failed_refresh(db=db, user=user, failure_code="inactive_user", revoke_count=0)
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome("inactive_user", failure_code="inactive_user"),
            detail="Unauthorized",
            user=user,
            refresh_row=refresh_row,
            user_id=user_id,
            jti=jti,
        )

    if token_version != user.token_version or refresh_row.token_version != user.token_version:
        revoke_count = await _revoke_refresh_row(
            db=db,
            refresh_row=refresh_row,
            now=now,
            reason="token_version_mismatch",
        )
        if revoke_count > 0:
            await _record_failed_refresh(
                db=db,
                user=user,
                failure_code="token_version_mismatch",
                revoke_count=revoke_count,
            )
        return RefreshSessionResolution(
            outcome=_failed_refresh_outcome(
                "token_version_mismatch",
                failure_code="token_version_mismatch",
                revoke_count=revoke_count,
            ),
            detail="Session revoked",
            user=user,
            refresh_row=refresh_row,
            user_id=user_id,
            jti=jti,
        )

    context_outcome = refresh_session_context_outcome(
        stored_ip=refresh_row.created_ip,
        current_ip=current_ip,
        stored_user_agent=refresh_row.user_agent,
        current_user_agent=current_user_agent,
    )
    return RefreshSessionResolution(
        outcome=context_outcome,
        detail="OK",
        user=user,
        refresh_row=refresh_row,
        user_id=user_id,
        jti=jti,
        now=now,
        expires_at=expires_at,
        context_outcome=context_outcome,
    )
