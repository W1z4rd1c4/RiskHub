# Phase 7: User Management & RBAC - Context

## Vision

Build a comprehensive role-based access control system that's **permission-aware everywhere** — data filtering, UI elements, and navigation all respect user roles and department boundaries. This is a POC with mock authentication and realistic test data, designed with future Entra ID integration in mind.

## How It Works

### Authentication (POC)
- **Login Form**: Simple username/password form validating against test accounts in database
- **Session Management**: JWT token-based authentication
- **Future**: M365/Entra ID integration for production (architecture should accommodate this)

### Test Data Structure
- **120 Test Accounts** representing a realistic non-life insurance company
- **Flat Department Structure**:
  - 8-10 departments (Underwriting, Claims, IT, Finance, Actuarial, Risk Management, Compliance, Legal, etc.)
  - Each department has 1 Department Head + 5-15 employees
  - C-suite roles at top (CEO, CFO, CRO, COO)
  - Governance roles (Risk Manager, Compliance, Legal, Audit, Actuarial Function)

### Role-Based Visibility

**Privileged Roles** (see everything):
- CEO, CFO, CRO
- Risk Manager
- Compliance Officer
- Legal
- Internal Audit
- Actuarial Function

**Department-Scoped Roles** (see only their department):
- COO (sees only Operations department)
- Other Department Heads (see only their respective departments)

**Employees**:
- See only what their Department Head/manager sees
- Inherit department-scoped visibility from their manager

### Permission-Aware UI (All Three Levels)

1. **Data Filtering**: 
   - List pages (Risks, Controls, KRIs, Departments) show only permitted data
   - COO sees only Operations risks/controls/KRIs
   - Employees see only their department's data

2. **UI Elements**:
   - Buttons/actions hidden based on role
   - Forms show/hide fields based on permissions
   - Dashboard widgets filtered by role

3. **Navigation**:
   - Menu items visible only to authorized roles
   - "User Management" page only for Admin/CRO
   - Role-specific dashboard views

## What's Essential

### Must-Have for Phase 7
- ✅ User database schema with roles and department hierarchy
- ✅ Mock authentication with login form
- ✅ 120 realistic test accounts (flat department structure)
- ✅ **3 Demo Accounts**: CRO, COO, Employee under COO
- ✅ Permission checking on ALL endpoints (data filtering)
- ✅ Permission-aware UI components (hide/show based on role)
- ✅ Permission-aware navigation (menu items)
- ✅ **Automated Tests**: Verify each role sees only what they should
- ✅ User management UI (admin-only: create, edit, deactivate users)
- ✅ Department hierarchy visualization

### Architecture Considerations
- Design auth layer to be swappable (mock → Entra ID later)
- Store user roles and department assignments in database
- Use middleware/decorators for permission checking
- Frontend: Context/hooks for current user and permission checks

## What's Out of Scope

### Not in Phase 7
- ❌ **User Self-Service**: No profile editing, password resets, or role change requests
- ❌ **Granular Permissions**: No "can edit but not delete" — just role-based visibility
- ❌ **User Activity Audit Trail**: Not tracking login times or view history (basic change tracking comes in Phase 10)
- ❌ **Entra ID Integration**: POC uses mock auth; real integration deferred to production
- ❌ **Password Recovery**: No "forgot password" flow for POC
- ❌ **Multi-factor Authentication**: Not needed for POC
- ❌ **Session Management UI**: No "active sessions" or "force logout"

## Success Looks Like

1. **Login as CRO**: See all risks, controls, KRIs across all departments
2. **Login as COO**: See only Operations department data, no other departments visible
3. **Login as Employee (under COO)**: See only Operations department data (same as COO)
4. **Automated Tests Pass**: Each role's visibility boundaries verified programmatically
5. **Admin Can Manage Users**: Create new users, assign roles, set department, deactivate accounts
6. **UI Adapts**: Navigation, buttons, and data all respect permissions without manual checks everywhere

## Demo Accounts (Required)

1. **CRO** (Chief Risk Officer)
   - Email: `cro@riskhub.test`
   - Role: CRO
   - Access: Full visibility across all departments

2. **COO** (Chief Operating Officer)
   - Email: `coo@riskhub.test`
   - Role: Department Head
   - Department: Operations
   - Access: Only Operations department data

3. **Employee under COO**
   - Email: `ops.employee@riskhub.test`
   - Role: Employee
   - Department: Operations
   - Manager: COO
   - Access: Only Operations department data (inherited from manager)

---

*Context gathered: 2025-12-26*
