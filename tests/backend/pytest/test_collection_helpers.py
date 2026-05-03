import pytest
from fastapi import HTTPException

from app.api.v1.endpoints._collection import (
    CollectionListContext,
    build_empty_collection_page,
    build_list_context,
)


def test_collection_list_context_parses_and_merges_legacy_filters():
    context = build_list_context(
        offset=10,
        limit=25,
        sort='{"field":"name","direction":"desc"}',
        filters='{"status":"active","department_id":7}',
        group_by="category",
        group_value="Operational",
        legacy_filters={"status": "draft", "include_archived": False},
    )

    assert isinstance(context, CollectionListContext)
    assert context.query.offset == 10
    assert context.query.limit == 25
    assert context.filters == {
        "status": "active",
        "department_id": 7,
        "include_archived": False,
    }
    assert context.is_grouped_drilldown is True
    assert context.is_group_summary is False


def test_collection_list_context_marks_group_summary():
    context = build_list_context(
        offset=0,
        limit=10,
        sort=None,
        filters=None,
        group_by="department",
        group_value=None,
    )

    assert context.is_group_summary is True
    assert context.is_grouped_drilldown is False


def test_collection_list_context_preserves_parse_validation():
    import warnings

    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("always")
        with pytest.raises(HTTPException) as exc_info:
            build_list_context(
                offset=0,
                limit=10,
                sort="{not json",
                filters=None,
                group_by=None,
                group_value=None,
            )

    assert exc_info.value.status_code == 422
    assert not any("HTTP_422_UNPROCESSABLE_ENTITY" in str(warning.message) for warning in recorded)


def test_collection_list_context_preserves_filter_parse_validation():
    with pytest.raises(HTTPException) as exc_info:
        build_list_context(
            offset=0,
            limit=10,
            sort=None,
            filters="{not json",
            group_by=None,
            group_value=None,
        )

    assert exc_info.value.status_code == 422


def test_empty_collection_page_uses_query_pagination_and_capabilities():
    context = build_list_context(
        offset=5,
        limit=15,
        sort=None,
        filters=None,
        group_by="vendor",
        group_value="bogus",
    )

    page = build_empty_collection_page(context, capabilities={"can_create": False})

    assert page == {
        "items": [],
        "total": 0,
        "offset": 5,
        "limit": 15,
        "groups": [],
        "capabilities": {"can_create": False},
    }
