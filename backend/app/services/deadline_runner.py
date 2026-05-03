"""Shared run-loop mechanics for deadline services."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Iterable
from typing import Any, TypeVar

from app.services.deadline_notifications import increment_deadline_results

TItem = TypeVar("TItem")

DeadlineProcessor = Callable[[TItem], Awaitable[dict[str, int]]]
DeadlineItemId = Callable[[TItem], Any]


async def run_deadline_items(
    db: Any,
    *,
    items: Iterable[TItem],
    results: dict[str, int],
    process_item: DeadlineProcessor[TItem],
    total_key: str | None = None,
    item_label: str = "deadline item",
    item_id: DeadlineItemId[TItem] | None = None,
    skip_result_keys: set[str] | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, int]:
    item_list = list(items)
    if total_key is not None:
        results[total_key] = len(item_list)

    ignored_keys = skip_result_keys or set()
    for item in item_list:
        resolved_item_id = item_id(item) if item_id else getattr(item, "id", None)
        try:
            async with db.begin_nested():
                item_results = await process_item(item)
        except Exception as exc:
            if logger is not None:
                logger.error(
                    "%s deadline check failed for %s=%s: %s",
                    item_label,
                    item_label.replace(" ", "_"),
                    resolved_item_id,
                    exc,
                )
            continue

        for key, value in item_results.items():
            if key in ignored_keys or not value:
                continue
            increment_deadline_results(results, key, count=value)

    await db.commit()
    return results
