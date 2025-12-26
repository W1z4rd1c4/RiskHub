# Plan 07-05 Summary: Test Data Generation (120 Users)

## Objective
Create seed scripts to generate 120 realistic test users representing a non-life insurance company structure, including 3 specific demo accounts for testing authentication and permission filtering.

## What Was Implemented

### 1. Roles and Permissions Seed Script
**File**: `backend/scripts/seed_roles_permissions.py`

Created comprehensive role and permission system:

**Permissions Created**:
- `*:*` - Full access to all resources
- `risks:read/write/delete` - Risk management permissions
- `controls:read/write/delete` - Control management permissions
- `kris:read/write` - KRI management permissions
- `reports:read` - Report viewing
- `users:read/write` - User management permissions

**Roles Created** (13 total):
- **C-Suite**: Admin, CEO, CFO, CRO, COO
- **Governance**: Risk Manager, Compliance, Legal, Internal Audit, Actuarial
- **Operational**: Department Head, Employee, Viewer

**Permission Assignments**:
- **Privileged Roles** (Admin, CEO, CFO, CRO, Risk Manager, Compliance, Legal, Audit, Actuarial): Full access (`*:*`)
- **Department Heads & COO**: Limited permissions (read/write for risks, controls, KRIs)
- **Employees**: Same as department heads
- **Viewer**: Read-only access

### 2. Users Seed Script
**File**: `backend/scripts/seed_users.py`

Generates 120 users with realistic structure:

**User Breakdown**:
1. **C-Suite** (4 users):
   - CEO: Maria Silva
   - CFO: John Chen
   - **CRO: Anna Kowalski** (DEMO ACCOUNT)
   - **COO: Robert Johnson** (DEMO ACCOUNT, Operations dept)

2. **Governance Roles** (6 users):
   - Risk Manager, Compliance Officer, Legal Counsel
   - Internal Auditor, Actuarial Function, System Admin

3. **Department Heads** (9 users):
   - One head per department (except Operations, which has COO)
   - All report to CEO

4. **Employees** (101 users):
   - 8-12 employees per department (randomized)
   - All report to their department head
   - **Operations Employee** (DEMO ACCOUNT) - First employee under COO

**Hierarchical Structure**:
```
CEO (Maria Silva)
├── CFO (John Chen)
├── CRO (Anna Kowalski) [DEMO]
├── COO (Robert Johnson) [DEMO]
│   └── Operations Employees (8-12)
│       └── ops.employee@riskhub.test [DEMO]
├── Underwriting Head
│   └── Underwriting Employees (8-12)
├── Claims Head
│   └── Claims Employees (8-12)
└── ... (7 more departments)
```

### 3. Master Seed Script
**File**: `backend/scripts/seed_all.py`

Orchestrates all seeding in correct order:
1. Departments
2. Roles & Permissions
3. Users
4. Risks
5. Controls
6. KRIs

## Demo Accounts

All demo accounts use password: `test123`

### 1. CRO Account (Privileged User)
- **Email**: `cro@riskhub.test`
- **Name**: Anna Kowalski
- **Role**: Chief Risk Officer
- **Department**: None (C-Suite)
- **Permissions**: Full access (`*:*`)
- **Can See**: ALL data across ALL departments
- **Use Case**: Test privileged user experience, full system access

### 2. COO Account (Department-Scoped User)
- **Email**: `coo@riskhub.test`
- **Name**: Robert Johnson
- **Role**: Chief Operating Officer
- **Department**: Operations
- **Permissions**: Limited (risks, controls, KRIs read/write)
- **Can See**: ONLY Operations department data
- **Use Case**: Test department-scoped filtering, limited access

### 3. Operations Employee (Basic User)
- **Email**: `ops.employee@riskhub.test`
- **Name**: Operations Employee
- **Role**: Employee
- **Department**: Operations
- **Manager**: COO (Robert Johnson)
- **Permissions**: Limited (risks, controls, KRIs read/write)
- **Can See**: ONLY Operations department data
- **Use Case**: Test employee experience, hierarchical relationships

## User Distribution by Department

Each department has:
- 1 Department Head (or COO for Operations)
- 8-12 Employees (randomized)
- Total: 9-13 users per department

**Departments**:
1. Operations (COO + 8-12 employees)
2. Underwriting (Head + 8-12 employees)
3. Claims (Head + 8-12 employees)
4. IT (Head + 8-12 employees)
5. Finance (Head + 8-12 employees)
6. Actuarial (Head + 8-12 employees)
7. Risk Management (Head + 8-12 employees)
8. Compliance (Head + 8-12 employees)
9. Legal (Head + 8-12 employees)
10. Human Resources (Head + 8-12 employees)

## How to Use

### Run Seed Scripts

```bash
cd backend

# Option 1: Run all seeds in order
python scripts/seed_all.py

# Option 2: Run individually
python scripts/seed_roles_permissions.py
python scripts/seed_users.py
```

### Test Demo Accounts

```bash
# Login as CRO (full access)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cro@riskhub.test","password":"test123"}'

# Login as COO (department-scoped)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"coo@riskhub.test","password":"test123"}'

# Login as Employee
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ops.employee@riskhub.test","password":"test123"}'
```

### Verify in Database

```sql
-- Check user count
SELECT COUNT(*) FROM users;  -- Should be ~120

-- Check role distribution
SELECT r.display_name, COUNT(*) 
FROM users u 
JOIN roles r ON u.role_id = r.id 
GROUP BY r.display_name;

-- Check department distribution
SELECT d.name, COUNT(*) 
FROM users u 
JOIN departments d ON u.department_id = d.id 
GROUP BY d.name;

-- Check demo accounts
SELECT email, name, role.display_name, dept.name
FROM users u
LEFT JOIN roles role ON u.role_id = role.id
LEFT JOIN departments dept ON u.department_id = dept.id
WHERE email IN ('cro@riskhub.test', 'coo@riskhub.test', 'ops.employee@riskhub.test');
```

## Testing Permission Filtering

With these users, you can now test the permission filtering from Plans 07-02 and 07-04:

### Test 1: CRO Sees All Data
```bash
# Login as CRO
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cro@riskhub.test","password":"test123"}' | jq -r '.access_token')

# Get all risks (should see ALL departments)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/risks
```

### Test 2: COO Sees Only Operations
```bash
# Login as COO
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"coo@riskhub.test","password":"test123"}' | jq -r '.access_token')

# Get risks (should see ONLY Operations department)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/risks
```

### Test 3: Employee Sees Only Their Department
```bash
# Login as Employee
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ops.employee@riskhub.test","password":"test123"}' | jq -r '.access_token')

# Get risks (should see ONLY Operations department)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/risks
```

## Files Created
- `backend/scripts/seed_roles_permissions.py` - Creates 12 permissions and 13 roles
- `backend/scripts/seed_users.py` - Creates 120 users with realistic structure
- `backend/scripts/seed_all.py` - Master script to run all seeds

## Integration with Previous Plans

This plan completes the authentication and permission system:
- **Plan 07-01**: User model with manager_id, RoleType enum
- **Plan 07-02**: Permission utilities, JWT endpoints, user CRUD
- **Plan 07-03**: Login page, AuthContext with JWT
- **Plan 07-04**: Permission filtering on risks and controls endpoints
- **Plan 07-05**: Test data to validate everything works

## Next Steps

**Immediate**: Run the seed scripts to populate the database
```bash
cd backend
python scripts/seed_all.py
```

**Then**: Test the authentication flow
1. Start backend: `uvicorn app.main:app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Navigate to http://localhost:5173
4. Login with demo accounts
5. Verify permission filtering works

**Future**: Complete remaining work
- Finish permission filtering for KRIs, departments, dashboard (Plan 07-04 remainder)
- Create frontend permission hook and UI updates
- Add automated tests for permission boundaries

---

**Completed**: 2025-12-26  
**Estimated Time**: 2 hours  
**Complexity**: Medium  
**Status**: Complete - Ready to run and test!
