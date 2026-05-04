from __future__ import annotations

from typing import Any


async def resolve_jit_user(*args: Any, **kwargs: Any) -> Any:
    from . import outcomes

    return await outcomes._resolve_sso_user(*args, **kwargs)
