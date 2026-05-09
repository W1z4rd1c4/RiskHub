from __future__ import annotations


def safe_entity_label(prefix: str, entity_id: int) -> str:
    """Build a stable non-PII audit label for entity surfaces."""
    return f"{prefix.upper()}-{entity_id}"
