from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

SortDirection = Literal["asc", "desc"]


class CollectionGroupRead(BaseModel):
    """Summary metadata for a grouped collection response."""

    value: str
    label: str
    count: int
    active_count: int | None = None
    highlighted_count: int | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class CollectionFacetOption(BaseModel):
    """Permission-scoped option exposed by a register collection."""

    value: str
    label: str
    count: int = Field(ge=0)
    selected: bool = False
    disabled: bool = False
    meta: dict[str, Any] = Field(default_factory=dict)
