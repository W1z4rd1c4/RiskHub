from __future__ import annotations

import inspect

import pytest

pytestmark = pytest.mark.contract


def _domain_error_subclasses(cls: type[BaseException]) -> set[type[BaseException]]:
    subclasses: set[type[BaseException]] = set()
    for subclass in cls.__subclasses__():
        subclasses.add(subclass)
        subclasses.update(_domain_error_subclasses(subclass))
    return subclasses


def test_exception_registry_owns_http_retry_and_audit_projections() -> None:
    from app.core import exceptions

    for function_name in ("to_http_exception", "is_retryable", "audit_log_payload"):
        assert hasattr(exceptions, function_name)
        assert inspect.isfunction(getattr(exceptions, function_name))


def test_every_domain_error_subclass_is_registered() -> None:
    from app.core.exceptions import EXCEPTION_REGISTRY, DomainError

    registered = set(EXCEPTION_REGISTRY)
    subclasses = _domain_error_subclasses(DomainError)

    assert subclasses <= registered
