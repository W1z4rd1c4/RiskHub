"""Small in-process TTL cache for short-lived aggregate API responses."""

from __future__ import annotations

from collections import OrderedDict
from copy import deepcopy
from threading import Lock
from time import monotonic
from typing import Generic, TypeVar

T = TypeVar("T")


class TTLCache(Generic[T]):
    """Simple bounded TTL cache for per-process API response memoization."""

    def __init__(self, *, ttl_seconds: int, max_entries: int) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._entries: OrderedDict[object, tuple[float, T]] = OrderedDict()
        self._lock = Lock()

    def get(self, key: object) -> T | None:
        now = monotonic()
        with self._lock:
            item = self._entries.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= now:
                self._entries.pop(key, None)
                return None
            self._entries.move_to_end(key)
            return deepcopy(value)

    def set(self, key: object, value: T) -> T:
        now = monotonic()
        expires_at = now + self._ttl_seconds
        cached_value = deepcopy(value)
        with self._lock:
            self._entries[key] = (expires_at, cached_value)
            self._entries.move_to_end(key)
            while len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)
        return deepcopy(cached_value)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def expire_all(self) -> None:
        now = monotonic() - 1
        with self._lock:
            for key, (_, value) in list(self._entries.items()):
                self._entries[key] = (now, value)
