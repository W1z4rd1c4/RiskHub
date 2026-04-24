from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class CollectionGroupRead(BaseModel):
    """Summary metadata for a grouped collection response."""

    value: str
    label: str
    count: int
    active_count: int | None = None
    highlighted_count: int | None = None
    meta: dict[str, Any] = Field(default_factory=dict)

