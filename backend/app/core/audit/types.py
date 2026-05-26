from __future__ import annotations

from collections.abc import Awaitable, Callable

# log_activity returns ActivityLog; most audit adapters discard it, while event-identity flows may use it.
AuditLogActivity = Callable[..., Awaitable[object]]
