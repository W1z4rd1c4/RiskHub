from __future__ import annotations

from typing import Any


async def resolve_sso_start(*args: Any, **kwargs: Any) -> Any:
    from . import outcomes

    return await outcomes.resolve_sso_start(*args, **kwargs)


async def resolve_sso_exchange(*args: Any, **kwargs: Any) -> Any:
    from . import outcomes

    return await outcomes.resolve_sso_exchange(*args, **kwargs)
