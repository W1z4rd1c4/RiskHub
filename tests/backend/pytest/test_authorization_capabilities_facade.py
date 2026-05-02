from pathlib import Path


def test_control_capabilities_is_exported_from_public_facade():
    from app.services.authorization_capabilities import control_capabilities

    assert callable(control_capabilities)


def test_legacy_authorization_capabilities_shim_is_removed():
    repo_root = Path(__file__).resolve().parents[3]

    assert not (repo_root / "backend/app/services/_authorization_capabilities_impl.py").exists()
