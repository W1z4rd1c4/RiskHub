from __future__ import annotations

from collections.abc import Mapping

from app.core.config import Settings

RateLimitRule = tuple[int, int]

DEFAULT_RATE_LIMIT_RULES: dict[str, RateLimitRule] = {
    "/api/v1/auth/config": (60, 60),
    "/api/v1/auth/login": (5, 60),
    "/api/v1/auth/sso": (10, 60),
    "/api/v1/auth/demo-login": (10, 60),
    "/api/v1/users": (100, 60),
    "default": (200, 60),
}


def _coerce_rate_limit_rule(value: object) -> RateLimitRule:
    if isinstance(value, tuple) and len(value) == 2:
        return int(value[0]), int(value[1])
    if isinstance(value, list) and len(value) == 2:
        return int(value[0]), int(value[1])
    raise ValueError(f"Invalid rate-limit rule payload: {value!r}")


def _normalize_rate_limit_rules(raw_rules: Mapping[str, object] | None) -> dict[str, RateLimitRule]:
    if not raw_rules:
        return {}
    return {
        str(path): _coerce_rate_limit_rule(rule)
        for path, rule in raw_rules.items()
    }


def resolve_rate_limit_rules(
    settings: Settings,
    *,
    explicit_limits: Mapping[str, object] | None = None,
) -> dict[str, RateLimitRule]:
    rules = dict(DEFAULT_RATE_LIMIT_RULES)
    rules.update(_normalize_rate_limit_rules(settings.redis.rate_limit_limits))
    rules.update(_normalize_rate_limit_rules(explicit_limits))
    return rules


def get_limit_for_path(limits: Mapping[str, RateLimitRule], path: str) -> RateLimitRule:
    matches = [
        (pattern, limit)
        for pattern, limit in limits.items()
        if pattern != "default" and path.startswith(pattern)
    ]
    if matches:
        return max(matches, key=lambda item: len(item[0]))[1]
    return limits.get("default", DEFAULT_RATE_LIMIT_RULES["default"])
