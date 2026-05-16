from app.core import exceptions


def test_migration_already_applied_error_has_exact_registry_projection() -> None:
    error_type = getattr(exceptions, "MigrationAlreadyAppliedError", None)

    assert error_type is not None
    assert issubclass(error_type, exceptions.ConflictError)

    projection = exceptions.EXCEPTION_REGISTRY[error_type]
    assert projection.status_code == 409
    assert projection.retryable is False
    assert projection.audit_code == "migration_already_applied"

    payload = exceptions.audit_log_payload(error_type("already applied"))
    assert payload["error_code"] == "migration_already_applied"
