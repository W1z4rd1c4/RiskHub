# Concerns

> Last updated: 2025-12-26 (Post Phase 7: User Management & RBAC)

## Technical Debt

| Issue | Location | Severity | Status |
|-------|----------|----------|--------|
| N+1 queries in department listing | `departments.py:41-104` | Medium | Existing |
| Hardcoded risk score thresholds | `departments.py:27-33` | Low | Existing |
| Hardcoded localhost URLs | `config.py:14-17`, verification scripts | Low | Existing |
| Some deferred audit issues | `AUDIT.md:101-163` | Low | Documented |
| **Incomplete permission filtering** | `kris.py`, `departments.py`, `dashboard.py` | **Medium** | **New** |
| **No frontend permission hook** | `frontend/src/hooks/` | **Low** | **New** |

### N+1 Query Pattern
Department listing runs 5+ SQL queries per department:
- user_count, risk_count, kri_count, high_risk_count, control_count

**Recommendation**: Use subquery aggregations or window functions.

### Incomplete Permission Filtering (Plan 07-04)
**Status**: Core implementation complete for risks and controls, remaining endpoints need updates.

**Completed**:
- ✅ Risks endpoint - Full permission filtering with `get_user_department_ids()`
- ✅ Controls endpoint - Full permission filtering

**Pending**:
- ❌ KRIs endpoint - Needs department filtering via risk relationship
- ❌ Departments endpoint - Needs to filter by accessible departments
- ❌ Dashboard endpoint - Aggregations need department filtering

**Impact**: Medium - Users can currently see all KRIs, departments, and dashboard stats regardless of permissions. This is a data visibility issue, not a security vulnerability (authentication still required).

**Recommendation**: Complete remaining endpoints following the established pattern:
```python
from app.core.permissions import get_user_department_ids

dept_ids = get_user_department_ids(current_user)
if dept_ids:
    query = query.filter(Model.department_id.in_(dept_ids))
```

### Missing Frontend Permission Hook
**Status**: Backend permission system complete, frontend UI not yet permission-aware.

**Impact**: Low - All security is enforced at API level. Frontend just needs to hide UI elements for better UX.

**Pending**:
- Create `usePermissions()` hook
- Update Sidebar to hide "User Management" for non-admins
- Hide create/delete buttons based on permissions

## Security Concerns

| Issue | Location | Risk | Status |
|-------|----------|------|--------|
| Debug mode default `True` | `config.py:11` | Medium | Existing |
| Hardcoded DB credentials | `config.py:14` | Medium | Existing |
| Localhost-only CORS | `config.py:17` | Low | Existing |
| **JWT secret in code** | `config.py` | **High** | **New** |
| **No token refresh** | Auth system | **Medium** | **New** |
| **No rate limiting** | All endpoints | **Medium** | **New** |

### JWT Secret Management
**Issue**: JWT secret key should be in environment variable, not hardcoded.

**Current**: `SECRET_KEY = "your-secret-key-here"`

**Recommendation**:
```python
SECRET_KEY: str = Field(default=..., env="JWT_SECRET_KEY")
```

### Token Expiration
**Current**: 60-minute token expiration, no refresh mechanism.

**Impact**: Users must re-login every hour.

**Recommendation**: Implement refresh token flow or extend expiration for trusted clients.

### Rate Limiting
**Issue**: No rate limiting on login endpoint or API calls.

**Impact**: Vulnerable to brute force attacks and API abuse.

**Recommendation**: Add `slowapi` or similar rate limiting middleware.

## Authentication & Authorization Status

### ✅ Implemented (Phase 7)
- JWT token authentication
- Password hashing with bcrypt
- Role-based access control (13 roles)
- Permission system (12 permissions)
- Department-scoped data filtering (risks, controls)
- User management APIs
- Login/logout endpoints
- Protected routes (frontend)
- Hierarchical user relationships (manager_id)
- 120 test users with seed scripts

### ⚠️ Partially Complete
- Permission filtering (2/5 endpoints done)
- Frontend permission-aware UI (0/3 components done)

### ❌ Not Implemented
- Token refresh mechanism
- Rate limiting
- CSRF protection
- Entra ID/M365 integration
- Password reset flow
- Email verification
- Two-factor authentication
- Session management
- Audit logging

## Data Quality Concerns

### Seed Data
**Status**: 120 test users created with realistic structure.

**Quality**: Good - Includes C-suite, governance roles, department heads, and employees.

**Demo Accounts**: 3 accounts for testing (CRO, COO, Employee).

**Concern**: No automated tests to verify seed data integrity.

**Recommendation**: Add tests to verify:
- User count (120)
- Role distribution
- Department distribution
- Manager-employee relationships

## Improvement Areas

### Short-term (1-2 weeks)
- Complete permission filtering for KRIs, departments, dashboard
- Create frontend `usePermissions()` hook
- Move JWT secret to environment variable
- Add rate limiting to login endpoint
- Add tests for seed data integrity

### Medium-term (1-2 months)
- Implement token refresh mechanism
- Replace N+1 queries with optimized aggregations
- Add comprehensive error handling
- Implement password reset flow
- Add audit logging for sensitive operations

### Long-term (3+ months)
- Implement Entra ID/M365 integration
- Add two-factor authentication
- Implement CSRF protection
- Add session management
- Comprehensive security audit

## From AUDIT.md (Deferred)
- 100-item grouped view limit (API design decision)
- 1000-item cap in verification scripts (API constraint)
- Frontend grouping null guards (already handled)

## Positive Notes

### ✅ No Critical Security Issues
- Authentication properly implemented with JWT
- Passwords hashed with bcrypt
- SQL injection prevented (SQLAlchemy ORM)
- Input validation (Pydantic)
- Permission checks at API level

### ✅ Clean Codebase
- No TODO/FIXME markers
- No deprecated code patterns
- API response format standardized
- Consistent async/await usage
- Type safety (TypeScript + Pydantic)

### ✅ Good Architecture
- Clear separation of concerns
- Dependency injection
- Modular structure
- Scalable patterns

## Risk Assessment

| Risk | Likelihood | Impact | Priority |
|------|------------|--------|----------|
| JWT secret exposure | Medium | High | **Critical** |
| Brute force login | High | Medium | **High** |
| Incomplete permission filtering | Low | Medium | Medium |
| Token expiration UX | High | Low | Low |
| N+1 query performance | Medium | Low | Low |

## Recommendations Priority

1. **Critical**: Move JWT secret to environment variable
2. **High**: Add rate limiting to login endpoint
3. **High**: Complete permission filtering (KRIs, departments, dashboard)
4. **Medium**: Implement token refresh mechanism
5. **Medium**: Add audit logging
6. **Low**: Create frontend permission hook
7. **Low**: Optimize N+1 queries
