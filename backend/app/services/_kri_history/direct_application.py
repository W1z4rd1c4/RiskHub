from __future__ import annotations

from typing import Any


async def apply_kri_value_directly(*args: Any, **kwargs: Any) -> Any:
    from .value_application import _apply_kri_value_directly

    return await _apply_kri_value_directly(*args, **kwargs)
