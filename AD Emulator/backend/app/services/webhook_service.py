"""Webhook service for dispatching events to RiskHub."""
import logging
from datetime import datetime, UTC
from typing import Any

import httpx

from app.config import get_settings
from app.schemas.webhook import WebhookPayload
from app.schemas.directory_user import DirectoryUserRead

logger = logging.getLogger(__name__)


async def dispatch_event(
    event_type: str,
    user_data: Any,
) -> bool:
    """
    Dispatch a webhook event to the configured target URL.
    
    This is fire-and-forget - AD operations should succeed regardless of webhook success.
    
    Args:
        event_type: One of "user.created", "user.updated", "user.deactivated", "user.activated"
        user_data: The DirectoryUser model instance or dict
        
    Returns:
        True if webhook was sent successfully, False otherwise
    """
    settings = get_settings()
    
    # Skip if no webhook target configured
    if not settings.WEBHOOK_TARGET_URL:
        logger.debug("No webhook target URL configured, skipping dispatch")
        return False
    
    try:
        # Convert model to schema if needed
        if hasattr(user_data, "__dict__"):
            # It's a SQLAlchemy model, convert to Pydantic schema
            user_read = DirectoryUserRead.model_validate(user_data)
        else:
            # Already a dict or Pydantic model
            user_read = DirectoryUserRead.model_validate(user_data)
        
        payload = WebhookPayload(
            event_type=event_type,
            timestamp=datetime.now(UTC),
            data=user_read,
        )
        
        logger.info(f"Dispatching webhook: {event_type} for user {user_read.external_id}")
        
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                settings.WEBHOOK_TARGET_URL,
                json=payload.model_dump(mode="json"),
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            
        logger.info(f"Webhook dispatched successfully: {event_type} -> {response.status_code}")
        return True
        
    except httpx.TimeoutException:
        logger.warning(f"Webhook timeout for {event_type} - target may be unavailable")
        return False
    except httpx.HTTPStatusError as e:
        logger.warning(f"Webhook failed with status {e.response.status_code}: {e.response.text}")
        return False
    except Exception as e:
        logger.error(f"Webhook dispatch error for {event_type}: {e}")
        return False
