from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass
from datetime import datetime

from app.core.datetime_utils import coerce_utc, utc_now


@dataclass(frozen=True)
class SsoChallenge:
    challenge_id: str
    nonce: str
    state: str
    return_to: str
    issued_at: datetime
    expires_at: datetime


def _coerce_required_utc(value: datetime) -> datetime:
    coerced = coerce_utc(value)
    if coerced is None:  # pragma: no cover - value type excludes None; defensive for future callers
        raise ValueError("SSO challenge timestamps must not be null")
    return coerced


class InMemorySsoChallengeStore:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._items: dict[str, SsoChallenge] = {}

    async def store(self, challenge: SsoChallenge) -> None:
        async with self._lock:
            self._purge_expired_locked()
            self._items[challenge.challenge_id] = challenge

    async def delete(self, challenge_id: str) -> None:
        async with self._lock:
            self._items.pop(challenge_id, None)

    async def consume(self, challenge_id: str) -> SsoChallenge | None:
        async with self._lock:
            self._purge_expired_locked()
            challenge = self._items.pop(challenge_id, None)
            if challenge is None:
                return None
            if _coerce_required_utc(challenge.expires_at) <= utc_now():
                return None
            return challenge

    def _purge_expired_locked(self) -> None:
        now = utc_now()
        expired_ids = [
            challenge_id
            for challenge_id, challenge in self._items.items()
            if _coerce_required_utc(challenge.expires_at) <= now
        ]
        for challenge_id in expired_ids:
            self._items.pop(challenge_id, None)


class RedisSsoChallengeStore:
    KEY_PREFIX = "riskhub:sso:challenge"
    CONSUME_SCRIPT = """
local value = redis.call('GET', KEYS[1])
if not value then
  return false
end
redis.call('DEL', KEYS[1])
return value
"""

    def __init__(self, redis) -> None:
        self._redis = redis

    def _key(self, challenge_id: str) -> str:
        return f"{self.KEY_PREFIX}:{challenge_id}"

    async def store(self, challenge: SsoChallenge) -> None:
        expires_at = _coerce_required_utc(challenge.expires_at)
        ttl_seconds = max(int((expires_at - utc_now()).total_seconds()), 1)
        await self._redis.set(self._key(challenge.challenge_id), self._serialize(challenge), ex=ttl_seconds)

    async def delete(self, challenge_id: str) -> None:
        await self._redis.delete(self._key(challenge_id))

    async def consume(self, challenge_id: str) -> SsoChallenge | None:
        payload = await self._redis.eval(self.CONSUME_SCRIPT, 1, self._key(challenge_id))
        if not payload:
            return None
        challenge = self._deserialize(str(payload))
        if _coerce_required_utc(challenge.expires_at) <= utc_now():
            return None
        return challenge

    @staticmethod
    def _serialize(challenge: SsoChallenge) -> str:
        payload = asdict(challenge)
        payload["issued_at"] = _coerce_required_utc(challenge.issued_at).isoformat()
        payload["expires_at"] = _coerce_required_utc(challenge.expires_at).isoformat()
        return json.dumps(payload)

    @staticmethod
    def _deserialize(payload: str) -> SsoChallenge:
        data = json.loads(payload)
        return SsoChallenge(
            challenge_id=str(data["challenge_id"]),
            nonce=str(data["nonce"]),
            state=str(data["state"]),
            return_to=str(data["return_to"]),
            issued_at=_coerce_required_utc(datetime.fromisoformat(str(data["issued_at"]))),
            expires_at=_coerce_required_utc(datetime.fromisoformat(str(data["expires_at"]))),
        )
