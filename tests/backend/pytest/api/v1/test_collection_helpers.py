from __future__ import annotations

from dataclasses import dataclass

from app.api.v1.endpoints._collection import (
    CollectionGroupEntry,
    CollectionQuery,
    build_grouped_collection_page,
    merge_collection_filters,
)


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
    assert groups == [
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
    assert [group["value"] for group in groups] == ["closed", "open"]
