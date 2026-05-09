"""Stable ownership helper names backed by shared resolver factories."""

from app.models import Control, ControlRiskLink, KeyRiskIndicator

from ._ownership_factory import make_ownership_resolvers

_kri = make_ownership_resolvers(
    model=KeyRiskIndicator,
    owner_column="reporting_owner_id",
    archived_column="is_archived",
)
_control = make_ownership_resolvers(
    model=Control,
    owner_column="control_owner_id",
    bridge=(ControlRiskLink, "control_id", "risk_id"),
)

is_kri_reporting_owner = _kri.is_owner
is_risk_kri_reporting_owner = _kri.is_target_owner
get_kri_ids_where_reporting_owner = _kri.ids_where_owner
get_risk_ids_where_kri_reporting_owner = _kri.target_ids_where_owner

is_control_owner = _control.is_owner
is_risk_control_owner = _control.is_target_owner
get_control_ids_where_owner = _control.ids_where_owner
get_risk_ids_where_control_owner = _control.target_ids_where_owner

__all__ = [
    "is_kri_reporting_owner",
    "is_risk_kri_reporting_owner",
    "get_kri_ids_where_reporting_owner",
    "get_risk_ids_where_kri_reporting_owner",
    "is_control_owner",
    "is_risk_control_owner",
    "get_control_ids_where_owner",
    "get_risk_ids_where_control_owner",
]
