from __future__ import annotations

from collections.abc import Awaitable, Callable

# log_activity returns ActivityLog, but audit adapters await it and discard the value.
AuditLogActivity = Callable[..., Awaitable[object]]
