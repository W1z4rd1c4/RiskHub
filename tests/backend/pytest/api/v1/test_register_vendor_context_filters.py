from __future__ import annotations

import pytest

from app.services._collection_contracts import CollectionQuery


def test_register_listing_shared_sentinels_and_prefix_parser_exist() -> None:
    from app.services._register_listings import controls, kris, risks, vendors
    from app.services._register_listings.shared import (
        GROUP_UNCATEGORIZED,
        GROUP_UNLINKED_VENDOR,
        parse_prefixed_group_value,
    )

    assert risks.RISK_GROUP_UNLINKED_VENDOR == GROUP_UNLINKED_VENDOR
    assert controls.CONTROL_GROUP_UNLINKED_VENDOR == GROUP_UNLINKED_VENDOR
    assert kris.KRI_GROUP_UNLINKED_VENDOR == GROUP_UNLINKED_VENDOR
    assert vendors.VENDOR_GROUP_UNLINKED_RISK != GROUP_UNLINKED_VENDOR

    assert risks.RISK_GROUP_UNCATEGORIZED == GROUP_UNCATEGORIZED
    assert controls.CONTROL_GROUP_UNCATEGORIZED == GROUP_UNCATEGORIZED
    assert kris.KRI_GROUP_UNCATEGORIZED == GROUP_UNCATEGORIZED

    assert parse_prefixed_group_value("vendor:123", prefix="vendor") == 123
    assert parse_prefixed_group_value("risk:456", prefix="risk") == 456
    assert parse_prefixed_group_value("vendor:not-an-int", prefix="vendor") is None
    assert parse_prefixed_group_value("__unlinked_vendor__", prefix="vendor") is None


def test_vendor_collection_filters_use_canonical_merge_helper() -> None:
    from app.services._collection_filters import merge_collection_filters
    from app.services._register_listings.vendors import coerce_vendor_list_criteria

    query = CollectionQuery(offset=2, limit=25, filters={"search": "override", "dora_relevant": True})
    defaults = {"search": "default", "include_archived": False, "dora_relevant": None}

    assert merge_collection_filters(query, defaults) == {
        "search": "override",
        "include_archived": False,
        "dora_relevant": True,
    }

    criteria = coerce_vendor_list_criteria(
        query,
        search="default",
        include_archived=False,
        vendor_type=None,
        dora_relevant=None,
        supports_important_core_insurance_function=None,
        is_significant_vendor=None,
        outsourcing_owner_user_id=None,
        department_id=None,
        process=None,
        subprocess=None,
        risk_score_1_5=None,
        sort_by=None,
        sort_order=None,
    )

    assert criteria.search == "override"
    assert criteria.dora_relevant is True
    assert criteria.include_archived is False


@pytest.mark.parametrize(
    ("module_name", "function_name"),
    [
        ("risks", "visible_risk_vendor_context"),
        ("controls", "visible_control_vendor_context"),
        ("kris", "visible_kri_vendor_context"),
    ],
)
def test_entity_vendor_context_wrappers_delegate_to_shared_helper(module_name: str, function_name: str) -> None:
    import inspect

    module = __import__(f"app.services._register_listings.{module_name}", fromlist=[function_name])
    source = inspect.getsource(getattr(module, function_name))

    assert "visible_vendor_link_context(" in source


def test_parse_prefixed_group_value_keeps_invalid_group_filters_fail_closed() -> None:
    from app.models import Control, KeyRiskIndicator, Risk, Vendor
    from app.services._register_listings.controls import control_group_filter
    from app.services._register_listings.kris import kri_group_filter
    from app.services._register_listings.risks import risk_group_value_filter
    from app.services._register_listings.vendors import vendor_group_value_filter

    assert str(risk_group_value_filter("vendor", "vendor:x").compile()).lower() == "false"
    assert str(control_group_filter("vendor", "vendor:x").compile()).lower() == "false"
    assert str(kri_group_filter("vendor", "vendor:x").compile()).lower() == "false"
    assert str(vendor_group_value_filter("risk", "risk:x").compile()).lower() == "false"

    assert Risk.id is not None
    assert Control.id is not None
    assert KeyRiskIndicator.id is not None
    assert Vendor.id is not None
