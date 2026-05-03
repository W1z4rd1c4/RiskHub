from app.services._orphaned_items.resolution_plan import resolution_requirements_for_item_type


def test_orphan_resolution_plan_requirements_match_supported_item_types():
    assert resolution_requirements_for_item_type("risk") == {
        "requires_owner": True,
        "requires_risk": False,
        "requires_department": True,
    }
    assert resolution_requirements_for_item_type("control") == {
        "requires_owner": True,
        "requires_risk": False,
        "requires_department": True,
    }
    assert resolution_requirements_for_item_type("kri") == {
        "requires_owner": False,
        "requires_risk": True,
        "requires_department": False,
    }
