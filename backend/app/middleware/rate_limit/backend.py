from __future__ import annotations

import math
import time
import uuid
from collections import deque
from dataclasses import dataclass, field


@dataclass
class RateLimitState:
    """Tracks bounded in-memory rate limit state for an IP/path key."""

    requests: deque[float] = field(default_factory=deque)
    blocked_until: float = 0.0
    last_seen: float = 0.0


class InMemoryRateLimitBackend:
    MAX_STATE_KEYS = 10000
    STATE_TTL_SECONDS = 600

    def __init__(self) -> None:
        self.state: dict[str, RateLimitState] = {}
        self._last_eviction = time.time()

    def _clean_old_requests(self, state: RateLimitState, *, window: int, now: float) -> None:
        cutoff = now - window
        while state.requests and state.requests[0] <= cutoff:
            state.requests.popleft()

    def _evict_stale_entries(self, *, now: float) -> None:
        if now - self._last_eviction < 60:
            return
        self._last_eviction = now

        cutoff = now - self.STATE_TTL_SECONDS
        stale_keys = [key for key, value in self.state.items() if value.last_seen < cutoff]
        for key in stale_keys:
            del self.state[key]

        if len(self.state) > self.MAX_STATE_KEYS:
            sorted_keys = sorted(self.state.keys(), key=lambda key: self.state[key].last_seen)
            for key in sorted_keys[: len(self.state) - self.MAX_STATE_KEYS]:
                del self.state[key]

    def check(
        self,
        *,
        client_ip: str,
        path: str,
        max_requests: int,
        window: int,
        now: float,
    ) -> tuple[bool, int]:
        self._evict_stale_entries(now=now)
        key = f"{client_ip}:{path}"
        state = self.state.setdefault(key, RateLimitState())
        state.last_seen = now
        self._clean_old_requests(state, window=window, now=now)

        if state.blocked_until > now:
            return False, max(0, math.ceil(state.blocked_until - now))

        if len(state.requests) >= max_requests:
            oldest_request = state.requests[0]
            state.blocked_until = oldest_request + window
            return False, max(0, math.ceil(state.blocked_until - now))

        state.requests.append(now)
        return True, 0


class RedisRateLimitBackend:
    _REDIS_LUA = """
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local member = ARGV[2]
    local window = tonumber(ARGV[3])
    local limit = tonumber(ARGV[4])
    local expire = tonumber(ARGV[5])

    redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
    local count = redis.call('ZCARD', key)
    if count >= limit then
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local oldestTs = tonumber(oldest[2])
      local retry = math.ceil((oldestTs + window - now) / 1000)
      if retry < 0 then retry = 0 end
      return {0, retry}
    end

    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, expire)
    return {1, 0}
    """

    async def check(
        self,
        *,
        redis,
        redis_key_prefix: str,
        client_ip: str,
        path: str,
        max_requests: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        now_ms = int(time.time() * 1000)
        window_ms = int(window_seconds * 1000)
        expire_seconds = int(window_seconds + 5)
        member = f"{now_ms}:{uuid.uuid4().hex}"
        key = f"{redis_key_prefix}:{client_ip}:{path}"

        allowed, retry_after = await redis.eval(
            self._REDIS_LUA,
            1,
            key,
            now_ms,
            member,
            window_ms,
            max_requests,
            expire_seconds,
        )
        return bool(allowed), int(retry_after)
