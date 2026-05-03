"""Discovery module marker for authz-sensitive backend/frontend paths."""

from __future__ import annotations

from .models import DiscoveredAuthzPath, Finding

__all__ = ["DiscoveredAuthzPath", "Finding"]
