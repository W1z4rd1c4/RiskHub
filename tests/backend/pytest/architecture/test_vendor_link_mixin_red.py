"""RED: AbstractVendorLink mixin invariants. Fails until #69 mixin lands."""

import pytest
from sqlalchemy.sql.schema import Column

pytestmark = pytest.mark.contract


def test_abstract_vendor_link_marked_abstract() -> None:
    from app.models._vendor_link_mixin import AbstractVendorLink

    assert getattr(AbstractVendorLink, "__abstract__", False) is True


def test_concrete_link_models_inherit_mixin() -> None:
    from app.models import VendorControlLink, VendorKRILink, VendorRiskLink
    from app.models._vendor_link_mixin import AbstractVendorLink

    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        assert issubclass(cls, AbstractVendorLink), cls.__name__


def test_vendor_id_fk_uniformly_cascades() -> None:
    from app.models import VendorControlLink, VendorKRILink, VendorRiskLink

    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        col: Column = cls.__table__.c.vendor_id
        fk = next(iter(col.foreign_keys))
        assert fk.ondelete == "CASCADE", f"{cls.__name__}.vendor_id missing cascade"


def test_unique_constraint_names_preserved() -> None:
    from app.models import VendorControlLink, VendorKRILink, VendorRiskLink

    pairs = {
        "vendor_risk_links": "uq_vendor_risk_link",
        "vendor_control_links": "uq_vendor_control_link",
        "vendor_kri_links": "uq_vendor_kri_link",
    }
    for cls in (VendorRiskLink, VendorControlLink, VendorKRILink):
        names = {c.name for c in cls.__table__.constraints if c.name and c.name.startswith("uq_")}
        assert pairs[cls.__tablename__] in names
