from app.models import ApprovalScenario, GlobalConfig


def test_kri_breach_classification_lives_in_monitoring_service():
    from app.services._monitoring_status.kris import classify_kri_breach

    assert classify_kri_breach(current_value=4, lower_limit=5, upper_limit=10) == "below"
    assert classify_kri_breach(current_value=11, lower_limit=5, upper_limit=10) == "above"
    assert classify_kri_breach(current_value=7, lower_limit=5, upper_limit=10) == "within"


def test_global_config_typed_value_helpers_live_in_config_service():
    from app.services._config.lookup import parse_global_config_value, serialize_global_config_value

    assert parse_global_config_value("42", "int") == 42
    assert parse_global_config_value("true", "bool") is True
    assert parse_global_config_value('{"a": 1}', "json") == {"a": 1}
    assert parse_global_config_value("raw", "string") == "raw"
    assert serialize_global_config_value({"a": 1}, "json") == '{"a": 1}'

    config = GlobalConfig(
        key="example",
        value="1",
        value_type="int",
        category="test",
        display_name="Example",
    )
    assert config.get_typed_value() == 1
    config.set_typed_value(2)
    assert config.value == "2"


def test_approval_scenario_role_helpers_live_in_riskhub_config_service():
    from app.services._riskhub_config.approval_scenario_roles import (
        get_approval_scenario_roles,
        set_approval_scenario_roles,
    )

    scenario = ApprovalScenario(
        key="risk_edit",
        display_name="Risk edit",
        description="Risk edit",
        approver_roles=["risk_owner"],
    )
    assert get_approval_scenario_roles(scenario) == ["risk_owner"]
    set_approval_scenario_roles(scenario, ["risk_manager", "cro"])
    assert scenario.approver_roles == ["risk_manager", "cro"]

    scenario.approver_roles = "not-json"
    assert get_approval_scenario_roles(scenario) == ["risk_manager", "cro"]
