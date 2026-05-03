from app.models import VendorControlLink, VendorKRILink, VendorRiskLink
from app.services._vendor_links import vendor_link_target


def test_vendor_link_targets_define_shared_link_metadata():
    risk_target = vendor_link_target("risk")
    control_target = vendor_link_target("control")
    kri_target = vendor_link_target("kri")

    assert risk_target.link_model is VendorRiskLink
    assert risk_target.entity_field == "risk_id"
    assert risk_target.entity_permission == "risks"
    assert risk_target.not_found_detail == "Risk not found"

    assert control_target.link_model is VendorControlLink
    assert control_target.entity_field == "control_id"
    assert control_target.entity_permission == "controls"
    assert control_target.not_found_detail == "Control not found"

    assert kri_target.link_model is VendorKRILink
    assert kri_target.entity_field == "kri_id"
    assert kri_target.entity_permission == "risks"
    assert kri_target.not_found_detail == "KRI not found"
