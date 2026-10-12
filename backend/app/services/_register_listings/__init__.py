"""Declared caller surface; implementation modules remain package-private."""

from importlib import import_module
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services._register_listings.assets import AssetListCriteria as AssetListCriteria
    from app.services._register_listings.assets import asset_collection_capabilities as asset_collection_capabilities
    from app.services._register_listings.assets import asset_criteria_from_filters as asset_criteria_from_filters
    from app.services._register_listings.assets import asset_filter_lookups as asset_filter_lookups
    from app.services._register_listings.assets import build_asset_listing as build_asset_listing
    from app.services._register_listings.controls import ControlListingCriteria as ControlListingCriteria
    from app.services._register_listings.controls import build_control_listing_plan as build_control_listing_plan
    from app.services._register_listings.controls import plan_control_listing as plan_control_listing
    from app.services._register_listings.issues import IssueListingCriteria as IssueListingCriteria
    from app.services._register_listings.issues import plan_issue_listing as plan_issue_listing
    from app.services._register_listings.kris import KRIListingCriteria as KRIListingCriteria
    from app.services._register_listings.kris import build_kri_listing_plan as build_kri_listing_plan
    from app.services._register_listings.kris import effective_kri_lifecycle as effective_kri_lifecycle
    from app.services._register_listings.kris import plan_kri_listing as plan_kri_listing
    from app.services._register_listings.lifecycle import RegisterListingPlan as RegisterListingPlan
    from app.services._register_listings.lifecycle import (
        build_in_memory_register_response as build_in_memory_register_response,
    )
    from app.services._register_listings.lifecycle import build_register_listing_plan as build_register_listing_plan
    from app.services._register_listings.lifecycle import (
        execute_register_listing_export as execute_register_listing_export,
    )
    from app.services._register_listings.lifecycle import execute_register_listing_plan as execute_register_listing_plan
    from app.services._register_listings.lifecycle import (
        load_register_listing_export_models as load_register_listing_export_models,
    )
    from app.services._register_listings.processes import ProcessListCriteria as ProcessListCriteria
    from app.services._register_listings.processes import build_process_listing as build_process_listing
    from app.services._register_listings.processes import (
        process_collection_capabilities as process_collection_capabilities,
    )
    from app.services._register_listings.processes import process_criteria_from_filters as process_criteria_from_filters
    from app.services._register_listings.processes import process_filter_lookups as process_filter_lookups
    from app.services._register_listings.risks import RISK_BANDS as RISK_BANDS
    from app.services._register_listings.risks import RiskListingCriteria as RiskListingCriteria
    from app.services._register_listings.risks import plan_risk_listing as plan_risk_listing
    from app.services._register_listings.shared import RegisterLifecycle as RegisterLifecycle
    from app.services._register_listings.shared import resolve_register_lifecycle as resolve_register_lifecycle
    from app.services._register_listings.threats import ThreatListCriteria as ThreatListCriteria
    from app.services._register_listings.threats import build_threat_listing as build_threat_listing
    from app.services._register_listings.threats import threat_collection_capabilities as threat_collection_capabilities
    from app.services._register_listings.threats import threat_criteria_from_filters as threat_criteria_from_filters
    from app.services._register_listings.threats import threat_filter_lookups as threat_filter_lookups
    from app.services._register_listings.vendors import VendorListCriteria as VendorListCriteria
    from app.services._register_listings.vendors import (
        can_view_vendor_full_derivation as can_view_vendor_full_derivation,
    )
    from app.services._register_listings.vendors import list_vendor_governance as list_vendor_governance
    from app.services._register_listings.vendors import plan_vendor_listing as plan_vendor_listing
    from app.services._register_listings.vendors import vendor_criteria_from_filters as vendor_criteria_from_filters
    from app.services._register_listings.vendors import vendor_filter_lookups as vendor_filter_lookups

CALLER_EXPORTS = {
    "plan_vendor_listing": ("service",),
    "plan_kri_listing": ("service",),
    "plan_control_listing": ("service",),
    "AssetListCriteria": ("endpoint", "service"),
    "ControlListingCriteria": ("endpoint", "service"),
    "IssueListingCriteria": ("endpoint", "service"),
    "KRIListingCriteria": ("endpoint", "service"),
    "ProcessListCriteria": ("endpoint", "service"),
    "RISK_BANDS": ("endpoint", "service"),
    "RegisterLifecycle": ("service",),
    "RegisterListingPlan": ("service",),
    "RiskListingCriteria": ("endpoint", "service"),
    "ThreatListCriteria": ("endpoint", "service"),
    "VendorListCriteria": ("endpoint", "service"),
    "asset_collection_capabilities": ("endpoint", "service"),
    "asset_criteria_from_filters": ("endpoint", "service"),
    "asset_filter_lookups": ("endpoint", "service"),
    "build_asset_listing": ("endpoint", "service"),
    "build_control_listing_plan": ("endpoint", "service"),
    "build_in_memory_register_response": ("endpoint", "service"),
    "build_kri_listing_plan": ("endpoint", "service"),
    "build_process_listing": ("endpoint", "service"),
    "build_register_listing_plan": ("service",),
    "build_threat_listing": ("endpoint", "service"),
    "can_view_vendor_full_derivation": ("endpoint", "service"),
    "effective_kri_lifecycle": ("service",),
    "execute_register_listing_export": ("endpoint", "service"),
    "execute_register_listing_plan": ("endpoint", "service"),
    "list_vendor_governance": ("endpoint", "service"),
    "load_register_listing_export_models": ("endpoint", "service"),
    "plan_issue_listing": ("endpoint", "service"),
    "plan_risk_listing": ("endpoint", "service"),
    "process_collection_capabilities": ("endpoint", "service"),
    "process_criteria_from_filters": ("endpoint", "service"),
    "process_filter_lookups": ("endpoint", "service"),
    "resolve_register_lifecycle": ("service",),
    "threat_collection_capabilities": ("endpoint", "service"),
    "threat_criteria_from_filters": ("endpoint", "service"),
    "threat_filter_lookups": ("endpoint", "service"),
    "vendor_criteria_from_filters": ("endpoint", "service"),
    "vendor_filter_lookups": ("endpoint", "service"),
}
CALLER_ROLES = {}  # type: dict[str, str]
CALLER_FACADES = ()
__all__ = list(CALLER_EXPORTS)

_BINDINGS = {
    "plan_vendor_listing": ("app.services._register_listings.vendors", "plan_vendor_listing"),
    "plan_kri_listing": ("app.services._register_listings.kris", "plan_kri_listing"),
    "plan_control_listing": ("app.services._register_listings.controls", "plan_control_listing"),
    "AssetListCriteria": ("app.services._register_listings.assets", "AssetListCriteria"),
    "ControlListingCriteria": ("app.services._register_listings.controls", "ControlListingCriteria"),
    "IssueListingCriteria": ("app.services._register_listings.issues", "IssueListingCriteria"),
    "KRIListingCriteria": ("app.services._register_listings.kris", "KRIListingCriteria"),
    "ProcessListCriteria": ("app.services._register_listings.processes", "ProcessListCriteria"),
    "RISK_BANDS": ("app.services._register_listings.risks", "RISK_BANDS"),
    "RegisterLifecycle": ("app.services._register_listings.shared", "RegisterLifecycle"),
    "RegisterListingPlan": ("app.services._register_listings.lifecycle", "RegisterListingPlan"),
    "RiskListingCriteria": ("app.services._register_listings.risks", "RiskListingCriteria"),
    "ThreatListCriteria": ("app.services._register_listings.threats", "ThreatListCriteria"),
    "VendorListCriteria": ("app.services._register_listings.vendors", "VendorListCriteria"),
    "asset_collection_capabilities": ("app.services._register_listings.assets", "asset_collection_capabilities"),
    "asset_criteria_from_filters": ("app.services._register_listings.assets", "asset_criteria_from_filters"),
    "asset_filter_lookups": ("app.services._register_listings.assets", "asset_filter_lookups"),
    "build_asset_listing": ("app.services._register_listings.assets", "build_asset_listing"),
    "build_control_listing_plan": ("app.services._register_listings.controls", "build_control_listing_plan"),
    "build_in_memory_register_response": (
        "app.services._register_listings.lifecycle",
        "build_in_memory_register_response",
    ),
    "build_kri_listing_plan": ("app.services._register_listings.kris", "build_kri_listing_plan"),
    "build_process_listing": ("app.services._register_listings.processes", "build_process_listing"),
    "build_register_listing_plan": ("app.services._register_listings.lifecycle", "build_register_listing_plan"),
    "build_threat_listing": ("app.services._register_listings.threats", "build_threat_listing"),
    "can_view_vendor_full_derivation": ("app.services._register_listings.vendors", "can_view_vendor_full_derivation"),
    "effective_kri_lifecycle": ("app.services._register_listings.kris", "effective_kri_lifecycle"),
    "execute_register_listing_export": ("app.services._register_listings.lifecycle", "execute_register_listing_export"),
    "execute_register_listing_plan": ("app.services._register_listings.lifecycle", "execute_register_listing_plan"),
    "list_vendor_governance": ("app.services._register_listings.vendors", "list_vendor_governance"),
    "load_register_listing_export_models": (
        "app.services._register_listings.lifecycle",
        "load_register_listing_export_models",
    ),
    "plan_issue_listing": ("app.services._register_listings.issues", "plan_issue_listing"),
    "plan_risk_listing": ("app.services._register_listings.risks", "plan_risk_listing"),
    "process_collection_capabilities": ("app.services._register_listings.processes", "process_collection_capabilities"),
    "process_criteria_from_filters": ("app.services._register_listings.processes", "process_criteria_from_filters"),
    "process_filter_lookups": ("app.services._register_listings.processes", "process_filter_lookups"),
    "resolve_register_lifecycle": ("app.services._register_listings.shared", "resolve_register_lifecycle"),
    "threat_collection_capabilities": ("app.services._register_listings.threats", "threat_collection_capabilities"),
    "threat_criteria_from_filters": ("app.services._register_listings.threats", "threat_criteria_from_filters"),
    "threat_filter_lookups": ("app.services._register_listings.threats", "threat_filter_lookups"),
    "vendor_criteria_from_filters": ("app.services._register_listings.vendors", "vendor_criteria_from_filters"),
    "vendor_filter_lookups": ("app.services._register_listings.vendors", "vendor_filter_lookups"),
}


def __getattr__(name: str) -> Any:
    if name not in _BINDINGS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute_name = _BINDINGS[name]
    return getattr(import_module(module_name), attribute_name)
