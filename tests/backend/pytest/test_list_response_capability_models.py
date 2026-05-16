"""Collection response capabilities use explicit Pydantic models."""

from __future__ import annotations

import types
from typing import get_args, get_origin

from app.schemas.control import ControlListCapabilities, ControlListResponse
from app.schemas.issue import IssueListCapabilities, IssueListResponse
from app.schemas.kri import KRIListCapabilities, KRIListResponse
from app.schemas.risk import RiskListCapabilities, RiskListResponse
from app.schemas.vendor import VendorListCapabilities, VendorListResponse


def _assert_list_capability_type(response_model: type, capabilities_model: type, expected_fields: set[str]) -> None:
    annotation = response_model.model_fields["capabilities"].annotation
    assert get_origin(annotation) is types.UnionType
    assert set(get_args(annotation)) == {capabilities_model, type(None)}
    assert set(capabilities_model.model_fields) == expected_fields


def test_list_response_capabilities_are_typed_models() -> None:
    _assert_list_capability_type(
        RiskListResponse,
        RiskListCapabilities,
        {"can_export", "can_create", "can_view_vendor_contexts"},
    )
    _assert_list_capability_type(
        ControlListResponse,
        ControlListCapabilities,
        {"can_export", "can_create", "can_view_vendor_contexts"},
    )
    _assert_list_capability_type(
        KRIListResponse,
        KRIListCapabilities,
        {"can_export", "can_create", "can_view_vendor_contexts"},
    )
    _assert_list_capability_type(
        VendorListResponse,
        VendorListCapabilities,
        {"can_export", "can_create", "can_view_risk_contexts"},
    )
    _assert_list_capability_type(
        IssueListResponse,
        IssueListCapabilities,
        {"can_export", "can_create", "can_view_vendor_contexts"},
    )


def test_list_response_capabilities_preserve_contextual_flags() -> None:
    assert RiskListCapabilities(
        can_export=True,
        can_create=True,
        can_view_vendor_contexts=True,
    ).model_dump() == {"can_export": True, "can_create": True, "can_view_vendor_contexts": True}
    assert ControlListCapabilities(
        can_export=True,
        can_create=True,
        can_view_vendor_contexts=True,
    ).model_dump() == {"can_export": True, "can_create": True, "can_view_vendor_contexts": True}
    assert KRIListCapabilities(
        can_export=True,
        can_create=True,
        can_view_vendor_contexts=True,
    ).model_dump() == {"can_export": True, "can_create": True, "can_view_vendor_contexts": True}
    assert VendorListCapabilities(
        can_export=True,
        can_create=True,
        can_view_risk_contexts=True,
    ).model_dump() == {"can_export": True, "can_create": True, "can_view_risk_contexts": True}
    assert IssueListCapabilities(
        can_export=True,
        can_create=True,
        can_view_vendor_contexts=True,
    ).model_dump() == {"can_export": True, "can_create": True, "can_view_vendor_contexts": True}
