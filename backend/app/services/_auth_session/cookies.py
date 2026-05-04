from __future__ import annotations

from typing import Any

from starlette.responses import Response

from app.core.config import Settings
from app.core.tokens import clear_refresh_cookie


def apply_session_cookie_plan(
    *,
    response: Response,
    settings: Settings,
    plan: Any,
) -> None:
    if plan.action == "clear_refresh":
        clear_refresh_cookie(response, settings)
