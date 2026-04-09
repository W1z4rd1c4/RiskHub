# frontend/src/services/api

## Purpose

Internal modules behind the public `@/services/apiClient` facade.

## Notes

- Keep `frontend/src/services/apiClient.ts` as the stable public import.
- Preserve 401 retry, error-key mapping, and blob-download behavior exactly.
- Success payloads are schema-validated at the transport boundary; new service calls should pass explicit response schemas instead of casting raw JSON to DTO types.
