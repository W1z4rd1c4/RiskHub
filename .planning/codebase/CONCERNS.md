# Concerns

Prioritized list of technical debt, risks, and issues identified in the codebase.

## Critical

### 1. Default Secrets in Production
- **Issue**: Hardcoded `secret_key` and `debug=True` in config defaults
- **Risk**: JWT forgery, info leak if env vars not overridden
- **Location**: `backend/app/core/config.py:11,17`
- **Fix**: Require env vars, fail startup if missing

## Major

### 2. Unauthenticated Report Endpoints
- **Issue**: Report download endpoints lack auth checks
- **Risk**: Anyone can export controls/risks/summary data
- **Location**: `backend/app/api/v1/endpoints/reports.py:34,154`
- **Fix**: Add `Depends(get_current_user)` + permission check

### 3. JWT in localStorage (XSS Risk)
- **Issue**: Token stored in localStorage, vulnerable to XSS
- **Risk**: Token exfiltration via script injection
- **Location**: `frontend/src/services/apiClient.ts:33`, `frontend/src/contexts/AuthContext.tsx:27`
- **Fix**: Use httpOnly cookies or secure storage

### 4. Mock Auth in Production Risk
- **Issue**: `X-Mock-User-Id` enabled by env flag
- **Risk**: Impersonation if misconfigured in prod
- **Location**: `backend/app/api/deps.py:16,28`
- **Fix**: Disable by default, require explicit dev flag

### 5. N+1 Queries in Department Summary
- **Issue**: Multiple per-department count queries
- **Risk**: Slow dashboards with many departments
- **Location**: `backend/app/api/v1/endpoints/departments.py:38,173`
- **Fix**: Use subqueries or eager loading

### 6. Race Condition in risk_id_code Generation
- **Issue**: `count + loop` without transactional protection
- **Risk**: Unique constraint violations under concurrent writes
- **Location**: `backend/app/api/v1/endpoints/risks.py:161`, `backend/app/models/risk.py:42`
- **Fix**: Use database sequence or SELECT FOR UPDATE

## Minor

### 7. Double-Commit Pattern
- **Issue**: DB dependency commits + endpoints also commit
- **Risk**: Masks transactional boundaries
- **Location**: `backend/app/db/session.py:19`

### 8. Silent Auth Errors
- **Issue**: `get_current_user_optional` swallows exceptions
- **Risk**: Hides auth parsing bugs
- **Location**: `backend/app/api/deps.py:59`

### 9. Memory Usage in Report Generation
- **Issue**: Loads full tables into memory for PDF/Excel
- **Risk**: Memory spikes with large datasets
- **Location**: `backend/app/api/v1/endpoints/reports.py:34`, `backend/app/services/report_service.py`

### 10. Database File in Repository
- **Issue**: `backend/risk_management.db` committed
- **Risk**: Data exposure if contains real data
- **Fix**: Add to `.gitignore`

---
*Last updated: 2025-12-28*
