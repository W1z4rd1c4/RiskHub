"""Domain exception primitives and HTTP translation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class DomainError(Exception):
    status_code = 400

    def __init__(
        self,
        detail: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.code = code
        self.headers = headers
        if status_code is not None:
            self.status_code = status_code


class ValidationError(DomainError):
    status_code = 400


class AuthorizationError(DomainError):
    status_code = 403


class AuthenticationError(DomainError):
    status_code = 401


class NotFoundError(DomainError):
    status_code = 404


class ConflictError(DomainError):
    status_code = 409


class PreconditionFailed(DomainError):
    status_code = 412


class ServiceFailure(DomainError):
    status_code = 500


@dataclass(frozen=True)
class ExceptionProjection:
    status_code: int
    retryable: bool
    audit_code: str


EXCEPTION_REGISTRY: dict[type[DomainError], ExceptionProjection] = {
    ValidationError: ExceptionProjection(status_code=400, retryable=False, audit_code="validation_error"),
    AuthorizationError: ExceptionProjection(status_code=403, retryable=False, audit_code="authorization_error"),
    AuthenticationError: ExceptionProjection(status_code=401, retryable=False, audit_code="authentication_required"),
    NotFoundError: ExceptionProjection(status_code=404, retryable=False, audit_code="not_found"),
    ConflictError: ExceptionProjection(status_code=409, retryable=False, audit_code="conflict"),
    PreconditionFailed: ExceptionProjection(status_code=412, retryable=False, audit_code="precondition_failed"),
    ServiceFailure: ExceptionProjection(status_code=500, retryable=True, audit_code="service_failure"),
}


def _projection_for(exc: DomainError | type[DomainError]) -> ExceptionProjection:
    exc_type = exc if isinstance(exc, type) else type(exc)
    return EXCEPTION_REGISTRY.get(
        exc_type,
        ExceptionProjection(
            status_code=getattr(exc_type, "status_code", 400),
            retryable=False,
            audit_code="domain_error",
        ),
    )


def to_http_exception(exc: DomainError) -> HTTPException:
    projection = _projection_for(exc)
    return HTTPException(
        status_code=getattr(exc, "status_code", projection.status_code),
        detail=exc.detail,
        headers=exc.headers,
    )


def is_retryable(exc: DomainError | type[DomainError]) -> bool:
    return _projection_for(exc).retryable


def audit_log_payload(exc: DomainError) -> dict[str, Any]:
    projection = _projection_for(exc)
    return {
        "error_type": type(exc).__name__,
        "error_code": exc.code or projection.audit_code,
        "detail": exc.detail,
        "retryable": projection.retryable,
    }


async def domain_error_handler(_request: Request, exc: DomainError) -> JSONResponse:
    http_exc = to_http_exception(exc)
    return JSONResponse(
        status_code=http_exc.status_code,
        content={"detail": http_exc.detail},
        headers=http_exc.headers,
    )
