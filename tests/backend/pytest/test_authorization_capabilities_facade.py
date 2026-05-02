def test_control_capabilities_is_exported_from_public_facade():
    from app.services.authorization_capabilities import control_capabilities

    assert callable(control_capabilities)
