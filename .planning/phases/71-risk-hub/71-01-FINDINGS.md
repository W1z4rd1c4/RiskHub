# Phase 71-01 Findings - Risk Hub Config Audit

## Scope
- **Models/Migrations:** `backend/app/models/risk_type.py`, `backend/app/models/global_config.py`, `backend/app/models/approval_scenario.py`, `backend/app/models/risk.py`, `backend/alembic/versions/74f4ad1b68cb_add_risk_hub_tables.py`
- **Endpoints/Services:** `backend/app/api/v1/endpoints/riskhub.py`, `backend/app/api/v1/endpoints/risks.py`, `backend/app/services/notification_service.py`, `backend/app/services/kri_deadline_service.py`, `backend/app/core/permissions.py`, `backend/app/services/report_service.py`
- **Out of scope:** AD Emulator

## Summary
- **Critical:** 0
- **High:** 3
- **Medium:** 1
- **Low:** 0

---

## Models and Migrations Findings

### 1) High — Risk type configuration is not integrated with Risk model/schemas
- **Evidence:** `backend/app/models/risk_type.py:8-44` (dynamic config model), `backend/app/models/risk.py:8-52` (hardcoded enum + string), `backend/app/schemas/risk.py:12-41` (RiskTypeEnum only strategic/operational), `backend/app/api/v1/endpoints/risks.py:34-65` (filter uses RiskTypeEnum)
- **Impact:** Risk types created in Risk Hub cannot be used for risks; API validation rejects new codes, and the Risk model has no FK or validation against `risk_types`. CRO configuration appears to work but is ignored in core risk flows.
- **Fix:** Replace hardcoded enums with a FK (`risk_type_id`) or validate `risk_type` codes against `risk_types` table on create/update. Update schemas and risk endpoints to accept dynamic types and add migration for existing risks. Consider preventing delete of active types that are still referenced.

### 2) Medium — `risk_count` is denormalized but never updated
- **Evidence:** `backend/app/models/risk_type.py:43-44` (denormalized count), `backend/app/api/v1/endpoints/riskhub.py:100-112,147-175,270-281` (risk_count surfaced and used in delete response/logging)
- **Impact:** Risk Hub UI and delete messages can display incorrect risk counts (likely always 0), undermining trust in configuration data.
- **Fix:** Either compute counts dynamically when listing risk types, or update `risk_count` whenever risks are created/updated/deleted (service hook or DB trigger). If not used, remove field from API responses.

---

## Usage and Enforcement Findings

### 3) High — GlobalConfig thresholds and notification settings are seeded but never used
- **Evidence:** `backend/alembic/versions/74f4ad1b68cb_add_risk_hub_tables.py:80-91` (thresholds + reminders), `backend/app/core/permissions.py:143-157` (hardcoded critical threshold), `backend/app/services/report_service.py:253` (hardcoded 16), `backend/app/services/kri_deadline_service.py:30-34` (hardcoded reminder windows)
- **Impact:** CRO edits in Risk Hub System Settings have no effect on risk classification, reporting, or KRI notifications. The UI advertises configurability that the backend ignores.
- **Fix:** Read `global_config` values when computing critical/high risk thresholds and notification timing (cache for performance). Replace hardcoded constants in permissions, dashboard/reporting, and KRI scheduling with configurable values and safe defaults.

### 4) High — Approval scenario configuration is not used in approval/notification logic
- **Evidence:** `backend/alembic/versions/74f4ad1b68cb_add_risk_hub_tables.py:94-103` (approval scenarios seed), `backend/app/api/v1/endpoints/riskhub.py:549-642` (CRUD only), `backend/app/services/notification_service.py:72-87` (hardcoded approver roles), `backend/app/services/kri_deadline_service.py:268-284` (hardcoded roles for escalation)
- **Impact:** Changing approval scenarios or approver roles in Risk Hub does not affect who can approve or who gets notified. This can create compliance gaps if CRO expects configuration changes to apply.
- **Fix:** Resolve approval scenarios by key in approval creation/notification flows. Use `requires_approval` to bypass/require approvals and `approver_roles` to determine recipients (including mapping dynamic roles like `risk_owner` to the actual risk owner).

---

## Areas Reviewed With No Issues Found
- `backend/app/models/global_config.py` (type parsing helpers are consistent with stored values; no immediate integrity issues)
- `backend/app/models/approval_scenario.py` (JSON list handling is resilient to parse errors)
