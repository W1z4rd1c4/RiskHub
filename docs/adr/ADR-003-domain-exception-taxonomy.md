# ADR-003 Domain Exception Taxonomy

## Status

Accepted

## Context

Service Modules currently raise FastAPI `HTTPException`, coupling domain workflow code to HTTP transport and making non-HTTP consumers harder to test. Some generic exception handling also hides the original traceback.

## Decision

Introduce a domain exception taxonomy with FastAPI translation at the API layer. The taxonomy includes `DomainError`, `NotFoundError`, `ConflictError`, `AuthorizationError`, `AuthenticationError`, `ValidationError`, and `PreconditionFailed`. AuthenticationError — caller has not presented credentials; projects to HTTP 401 with `WWW-Authenticate` header. Exception translation must preserve the existing HTTP `detail` strings unless a behavior test explicitly changes them.

`backend/app/core/exceptions.py` owns the projection registry: `EXCEPTION_REGISTRY`, `to_http_exception`, `is_retryable`, and `audit_log_payload`. Domain errors may carry HTTP headers when compatibility requires it, such as the mock-auth `WWW-Authenticate: Bearer` response.

## Alternatives Rejected

- Leave `HTTPException` in services: rejected because the transport dependency leaks through service Interfaces.
- Convert all exceptions without preserving details: rejected because API clients and tests depend on stable error bodies.
- Use generic `Exception` subclasses only: rejected because status-code mapping should be explicit.

## Migration Impact

The sweep runs per bounded context. Endpoint tests remain the API behavior contract, while service tests assert domain exception types.

## Rollback Strategy

Rollback by bounded context. The API exception handler can coexist with remaining `HTTPException` paths during migration.

## Invariant Tests

- AST ban on `raise HTTPException` in migrated service packages and reviewed core seams.
- Registry completeness for every `DomainError` subclass.
- Endpoint tests assert status and `detail` preservation.
- Service tests assert domain exception type for representative failures.
