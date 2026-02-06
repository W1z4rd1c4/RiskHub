from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Dict, Protocol, Tuple


@dataclass
class LoginAttemptState:
    failed_attempts: int = 0
    locked_until: float = 0.0
    last_attempt: float = 0.0


class AccountLockoutBackend(Protocol):
    async def is_locked(self, identifier: str) -> Tuple[bool, int]: ...
    async def record_failed_attempt(self, identifier: str) -> Tuple[bool, int]: ...
    async def record_successful_login(self, identifier: str) -> None: ...


def _normalize_identifier(identifier: str) -> str:
    return identifier.strip().lower()


def _hash_identifier(identifier: str) -> str:
    normalized = _normalize_identifier(identifier)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


class AccountLockoutService:
    # Lockout configuration (shared semantics across backends)
    MAX_FAILED_ATTEMPTS = 5
    LOCKOUT_DURATION_SECONDS = 900  # 15 minutes
    ATTEMPT_WINDOW_SECONDS = 600  # 10 minutes

    def __init__(self, backend: AccountLockoutBackend):
        self.backend = backend

    async def is_locked(self, identifier: str) -> Tuple[bool, int]:
        return await self.backend.is_locked(identifier)

    async def record_failed_attempt(self, identifier: str) -> Tuple[bool, int]:
        return await self.backend.record_failed_attempt(identifier)

    async def record_successful_login(self, identifier: str) -> None:
        await self.backend.record_successful_login(identifier)


class InMemoryAccountLockoutBackend(AccountLockoutBackend):
    def __init__(
        self,
        *,
        max_failed_attempts: int = AccountLockoutService.MAX_FAILED_ATTEMPTS,
        lockout_duration_seconds: int = AccountLockoutService.LOCKOUT_DURATION_SECONDS,
        attempt_window_seconds: int = AccountLockoutService.ATTEMPT_WINDOW_SECONDS,
    ):
        self.max_failed_attempts = max_failed_attempts
        self.lockout_duration_seconds = lockout_duration_seconds
        self.attempt_window_seconds = attempt_window_seconds
        self.accounts: Dict[str, LoginAttemptState] = {}

    async def is_locked(self, identifier: str) -> Tuple[bool, int]:
        key = _normalize_identifier(identifier)
        state = self.accounts.get(key)
        if not state:
            return False, 0

        now = time.time()
        if state.locked_until > now:
            return True, int(state.locked_until - now)
        return False, 0

    async def record_failed_attempt(self, identifier: str) -> Tuple[bool, int]:
        key = _normalize_identifier(identifier)
        state = self.accounts.get(key) or LoginAttemptState()
        self.accounts[key] = state

        now = time.time()
        if state.last_attempt and (now - state.last_attempt) > self.attempt_window_seconds:
            state.failed_attempts = 0

        state.failed_attempts += 1
        state.last_attempt = now

        if state.failed_attempts >= self.max_failed_attempts:
            state.locked_until = now + self.lockout_duration_seconds
            return True, self.lockout_duration_seconds

        attempts_remaining = self.max_failed_attempts - state.failed_attempts
        return False, attempts_remaining

    async def record_successful_login(self, identifier: str) -> None:
        key = _normalize_identifier(identifier)
        self.accounts.pop(key, None)


class RedisAccountLockoutBackend(AccountLockoutBackend):
    def __init__(
        self,
        redis,
        *,
        key_prefix: str = "riskhub:auth",
        max_failed_attempts: int = AccountLockoutService.MAX_FAILED_ATTEMPTS,
        lockout_duration_seconds: int = AccountLockoutService.LOCKOUT_DURATION_SECONDS,
        attempt_window_seconds: int = AccountLockoutService.ATTEMPT_WINDOW_SECONDS,
    ):
        self.redis = redis
        self.key_prefix = key_prefix
        self.max_failed_attempts = max_failed_attempts
        self.lockout_duration_seconds = lockout_duration_seconds
        self.attempt_window_seconds = attempt_window_seconds

    def _lock_key(self, identifier: str) -> str:
        return f"{self.key_prefix}:lock:{_hash_identifier(identifier)}"

    def _fail_key(self, identifier: str) -> str:
        return f"{self.key_prefix}:fail:{_hash_identifier(identifier)}"

    async def is_locked(self, identifier: str) -> Tuple[bool, int]:
        lock_key = self._lock_key(identifier)
        ttl = await self.redis.ttl(lock_key)
        if ttl and ttl > 0:
            return True, int(ttl)
        return False, 0

    async def record_failed_attempt(self, identifier: str) -> Tuple[bool, int]:
        lock_key = self._lock_key(identifier)
        fail_key = self._fail_key(identifier)

        # If already locked, keep returning remaining TTL.
        ttl = await self.redis.ttl(lock_key)
        if ttl and ttl > 0:
            return True, int(ttl)

        # Atomic increment + set expiry on first failure in window.
        lua = """
        local fail_key = KEYS[1]
        local lock_key = KEYS[2]
        local window = tonumber(ARGV[1])
        local max_failed = tonumber(ARGV[2])
        local lockout = tonumber(ARGV[3])

        local count = redis.call('INCR', fail_key)
        if count == 1 then
          redis.call('EXPIRE', fail_key, window)
        end

        if count >= max_failed then
          redis.call('SET', lock_key, '1', 'EX', lockout)
          return {1, lockout}
        end

        return {0, max_failed - count}
        """
        locked, info = await self.redis.eval(
            lua,
            2,
            fail_key,
            lock_key,
            self.attempt_window_seconds,
            self.max_failed_attempts,
            self.lockout_duration_seconds,
        )

        return bool(locked), int(info)

    async def record_successful_login(self, identifier: str) -> None:
        await self.redis.delete(self._fail_key(identifier), self._lock_key(identifier))
