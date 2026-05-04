from __future__ import annotations

from typing import Any


async def resolve_refresh_session(*args: Any, **kwargs: Any) -> Any:
    from . import outcomes

    return await outcomes.resolve_refresh_session(*args, **kwargs)
