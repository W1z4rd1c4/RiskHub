from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.api.v1.endpoints._collection import (
    CollectionGroupEntry,
    CollectionQuery,
    build_grouped_collection_page,
    merge_collection_filters,
)
from app.api.v1.endpoints._collection_execution import build_collection_page_kwargs
from app.schemas.collection import CollectionGroupRead


@dataclass(frozen=True)
class ExampleItem:
    name: str
    groups: tuple[str, ...]
    active: bool = True
    highlighted: bool = False


def _entries(item: ExampleItem, group_by: str):
    if group_by != "status":
        return []
    return [CollectionGroupEntry(value, value.upper()) for value in item.groups]


def test_merge_collection_filters_prefers_json_filters_over_defaults():
    query = CollectionQuery(filters={"status": "archived", "include_archived": True})

    merged = merge_collection_filters(
        query,
        {"status": "active", "department_id": 10, "include_archived": False},
    )

    assert merged == {
        "status": "archived",
        "department_id": 10,
        "include_archived": True,
    }


def test_build_grouped_collection_page_returns_summary_without_items():
    query = CollectionQuery(group_by="status", offset=0, limit=10)
    items = [
        ExampleItem("one", ("open", "open"), active=True, highlighted=True),
        ExampleItem("two", ("open",), active=False),
        ExampleItem("three", ("closed",), active=True),
    ]

    page_items, total, groups = build_grouped_collection_page(
        items,
        query,
        get_entries=_entries,
        is_active=lambda item: item.active,
        is_highlighted=lambda item: item.highlighted,
    )

    assert page_items == []
    assert total == 3
    assert [group.model_dump() for group in groups] == [
        {
            "value": "closed",
            "label": "CLOSED",
            "count": 1,
            "active_count": 1,
            "highlighted_count": 0,
            "meta": {},
        },
        {
            "value": "open",
            "label": "OPEN",
            "count": 2,
            "active_count": 1,
            "highlighted_count": 1,
            "meta": {},
        },
    ]


def test_build_grouped_collection_page_paginates_drilldown_items():
    query = CollectionQuery(group_by="status", group_value="open", offset=1, limit=1)
    items = [
        ExampleItem("one", ("open",)),
        ExampleItem("two", ("open", "closed")),
        ExampleItem("three", ("closed",)),
    ]

    page_items, total, groups = build_grouped_collection_page(
        items,
        query,
        get_entries=_entries,
    )

    assert page_items == [items[1]]
    assert total == 2
    assert [group.value for group in groups] == ["closed", "open"]


def test_build_collection_page_kwargs_uses_query_pagination_and_optional_metadata():
    query = CollectionQuery(offset=25, limit=10, group_by="status", group_value="open")
    groups = [
        CollectionGroupRead(
            value="open",
            label="Open",
            count=3,
            active_count=2,
            highlighted_count=1,
        )
    ]

    payload = build_collection_page_kwargs(
        query=query,
        items=[{"id": 1}],
        total=3,
        groups=groups,
        capabilities={"can_create": True},
    )

    assert payload == {
        "items": [{"id": 1}],
        "total": 3,
        "offset": 25,
        "limit": 10,
        "groups": groups,
        "capabilities": {"can_create": True},
    }


class ExampleCollectionResponse:
    def __init__(self, **kwargs):
        self.payload = kwargs


@pytest.mark.asyncio
async def test_execute_collection_listing_returns_sql_group_summary_without_serializing_items():
    from app.api.v1.endpoints._collection_execution import execute_collection_listing

    calls: list[str] = []
    groups = [
        CollectionGroupRead(
            value="active",
            label="Active",
            count=5,
            active_count=5,
            highlighted_count=1,
        )
    ]

    async def load_sql_groups(group_by: str) -> list[CollectionGroupRead]:
        calls.append(f"groups:{group_by}")
        return groups

    async def serialize_items(items: list[ExampleItem]) -> list[ExampleItem]:
        calls.append("serialize")
        return items

    response = await execute_collection_listing(
        db=None,
        response_model=ExampleCollectionResponse,
        query=CollectionQuery(group_by="status", offset=0, limit=10),
        ordered_query=object(),
        total=5,
        capabilities={"can_create": True},
        serialize_items=serialize_items,
        sql_group_keys={"status"},
        load_sql_groups=load_sql_groups,
        build_sql_group_filter=lambda group_by, group_value: object(),
    )

    assert calls == ["groups:status"]
    assert response.payload == {
        "items": [],
        "total": 5,
        "offset": 0,
        "limit": 10,
        "groups": groups,
        "capabilities": {"can_create": True},
    }
