# Authorization List/Lookup Policy (Anti-Enumeration)

> **Version**: 1.2
> **Last Updated**: 2026-04-25
> **Audience**: Backend Engineering, Security Reviewers
> **Source of Truth**: `app/core/permissions.py`, endpoint-level RBAC guards

RiskHub uses different responses for list/lookup endpoints versus detail endpoints to reduce data leakage and probing risk.

## 1) List and Lookup Endpoints

When a caller applies a filter outside their visible scope (for example, requesting another department), endpoints should return:

- `HTTP 200`
- Empty result set (`[]`)

Rationale:

- Avoids leaking existence of data through authorization errors.
- Keeps client list behavior predictable.

Example:

- `GET /api/v1/users/lookup?department_id=<outside_scope>` -> `200 []`

## 2) Detail Endpoints

For single-resource detail reads (`/resource/{id}`):

- Return `404` when resource is missing **or not visible** to the caller.
- Return `403` only when caller lacks endpoint-level permission entirely.

Rationale:

- `404` for out-of-scope detail reads prevents enumeration attacks.
- Explicit `403` remains useful for capability-level denial.

## 3) Documentation Endpoint Alignment

Documentation audience behavior follows strict role split:

- `admin` role receives admin audience docs only.
- Non-admin roles receive user audience docs only.

This is an access-policy contract, not a UI-only behavior.

## 4) Current Workflow Visibility Notes

- KRI history read uses canonical KRI visibility, including reporting-owner and linked-risk visibility paths.
- Risk questionnaire read uses canonical risk visibility; action/submit capability remains narrower than read capability.
- Report exports apply final-row authorization after as-of replay; explicit `department_id` filters are strict on the replayed row state.

## 5) Verification Expectations

- Add API tests for both allowed and denied scope paths.
- Assert list endpoints do not leak hidden objects.
- Assert detail endpoints preserve anti-enumeration semantics.
