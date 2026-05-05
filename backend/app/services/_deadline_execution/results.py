from __future__ import annotations


def increment_deadline_results(results: dict[str, int], *keys: str, count: int = 1) -> None:
    for key in keys:
        results[key] = results.get(key, 0) + count
