"""Directory integration endpoints (sync only)."""
import hashlib
import hmac
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.core.config import get_settings
from app.core.permissions import can_manage_users
from app.db.session import get_db
from app.models import User
from app.models.directory_sync_log import DirectorySyncLog
from app.schemas.directory_sync import (
    DirectorySyncLogRead,
    DirectorySyncPreview,
    WebhookPayload,
    WebhookResponse,
)
from app.services.directory_sync_service import DirectorySyncService

logger = logging.getLogger(__name__)

router = APIRouter()


def _require_admin(current_user: User) -> None:
    if not can_manage_users(current_user):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def _verify_webhook_signature(payload: bytes, signature: str | None, secret: str) -> None:
    """
    Verify HMAC-SHA256 signature for webhook payload.

    Args:
        payload: Raw request body bytes
        signature: X-Webhook-Signature header value (format: sha256=<hex>)
        secret: Webhook secret from config

    Raises:
        HTTPException: 401 if signature is invalid or missing
        HTTPException: 500 if secret not configured in production
    """
    settings = get_settings()
    if not secret:
        # No secret configured - only allow in debug mode
        if settings.debug:
            logger.warning("WEBHOOK_SECRET not configured - skipping signature verification (DEBUG ONLY)")
            return
        # Production mode with no secret = reject (fail-closed)
        logger.error("WEBHOOK_SECRET not configured in production mode - rejecting webhook")
        raise HTTPException(
            status_code=500,
            detail="Webhook secret not configured (required in production)"
        )

    if not signature:
        raise HTTPException(
            status_code=401,
            detail="Missing X-Webhook-Signature header"
        )

    # Expected format: sha256=<hex>
    if not signature.startswith("sha256="):
        raise HTTPException(
            status_code=401,
            detail="Invalid signature format"
        )

    provided_hash = signature[7:]  # Strip "sha256=" prefix
    expected_hash = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(provided_hash, expected_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid webhook signature"
        )


@router.post("/sync/preview", response_model=DirectorySyncPreview)
async def preview_directory_sync(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Preview directory sync changes from external AD Emulator without applying (admin-only)."""
    _require_admin(current_user)
    return await DirectorySyncService.preview_sync(db)


@router.post("/sync/apply", response_model=DirectorySyncPreview)
async def apply_directory_sync(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Apply directory sync changes from external AD Emulator (admin-only)."""
    _require_admin(current_user)
    return await DirectorySyncService.apply_sync(db)


@router.get("/sync/history", response_model=list[DirectorySyncLogRead])
async def list_directory_sync_history(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """List recent directory sync runs (admin-only)."""
    _require_admin(current_user)

    result = await db.execute(
        select(DirectorySyncLog).order_by(DirectorySyncLog.created_at.desc()).limit(10)
    )
    return result.scalars().all()


@router.post("/webhook", response_model=WebhookResponse)
async def receive_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_webhook_signature: str | None = Header(None),
):
    """
    Receive webhook notifications from AD Emulator.

    This endpoint is called by AD Emulator when directory users are created,
    updated, deactivated, or activated. It automatically syncs the affected
    user to RiskHub.

    Security: Requires valid HMAC-SHA256 signature in X-Webhook-Signature header
    when WEBHOOK_SECRET is configured.
    """
    # Get raw body for signature verification
    body = await request.body()

    # Verify signature
    settings = get_settings()
    _verify_webhook_signature(body, x_webhook_signature, settings.webhook_secret)

    # Parse payload after verification
    import json
    try:
        payload_dict = json.loads(body)
        payload = WebhookPayload(**payload_dict)
    except Exception as e:
        logger.warning(f"Webhook payload parse failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

    logger.info(
        f"Received webhook: {payload.event_type} for user {payload.data.external_id} "
        f"({payload.data.email or 'no email'})"
    )

    try:
        # Convert Pydantic model to dict for sync service
        user_data = payload.data.model_dump()

        # Trigger automatic sync for this single user
        result = await DirectorySyncService.sync_single_user(
            db=db,
            user_data=user_data,
            event_type=payload.event_type,
        )

        action = result.get("action", "unknown")
        orphaned_count = result.get("orphaned_items", {}).get("total", 0)

        logger.info(
            f"Webhook processed: {payload.event_type} -> {action}, "
            f"user_id={result.get('user_id')}, orphaned_count={orphaned_count}"
        )

        return WebhookResponse(
            status="processed",
            action=action,
            orphaned_count=orphaned_count,
        )

    except ValueError as e:
        # Validation/business logic error - 400 (don't retry)
        logger.warning(f"Webhook validation failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook data")

    except Exception:
        # Processing error - 500 (retry)
        # Note: sync_single_user is idempotent (upsert pattern) so retries are safe
        logger.exception("Webhook processing failed")
        raise HTTPException(status_code=500, detail="Webhook processing failed")
