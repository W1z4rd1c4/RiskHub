# Authorization List/Lookup Policy (Anti‑Enumeration)

RiskHub uses different response behaviors for **lists/lookups** vs **single-object detail** endpoints to reduce
information leakage (anti‑enumeration) while keeping the UI predictable.

## 1) List / lookup endpoints

When a request includes a filter that is **out of the caller’s scope** (for example, a department-scoped user
passing `department_id=<other department>`), the endpoint should return:

- **HTTP 200**
- An **empty list** (`[]`)

Rationale:
- Returning a 403/404 for list filters can reveal scope boundaries or object existence.
- Returning `[]` keeps pagination/UI logic simple and avoids “did it exist?” side-channels.

Example:
- `GET /api/v1/users/lookup?department_id=123` (dept-scoped caller not in dept 123) → `200 []`

## 2) Detail endpoints (single resource by ID)

For detail endpoints where the caller requests a specific object by ID, the service should prefer:

- **404** if the object is not found **or not visible** (anti‑enumeration)
- **403** only when the caller lacks the **endpoint-level permission** entirely

Rationale:
- For details, returning 404 for “not visible” prevents probing for existence across departments.
- Permission failures should remain explicit when the endpoint itself is not allowed.

