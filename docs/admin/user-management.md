# User Management

> **Audience**: Administrator, CRO  
> **Location**: Sidebar → Access Management

---

## Table of Contents

1. [User Management Overview](#1-user-management-overview)
2. [Adding Users](#2-adding-users)
3. [Role Assignment](#3-role-assignment)
4. [Department Assignment](#4-department-assignment)
5. [Access Scope Configuration](#5-access-scope-configuration)
6. [Permission Matrix](#6-permission-matrix)
7. [Deactivating Users](#7-deactivating-users)
8. [Best Practices](#8-best-practices)

---

## 1. User Management Overview

RiskHub manages users through the **Access Management** section, accessible to Administrators and CRO.

### Key Concepts

- **Users** are authenticated via Active Directory or internal accounts
- **Roles** determine what actions a user can perform
- **Departments** scope what data a user can see
- **Access Scope** determines breadth of visibility (Global/Department/Manager)

### User Lifecycle

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    CREATE    │───▶│    ASSIGN    │───▶│    ACTIVE    │───▶│   DEACTIVATE │
│    User      │    │  Role/Dept   │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## 2. Adding Users

### From Active Directory

If your organization uses Active Directory/Entra ID integration:

1. Navigate to **Access Management → Users**
2. Click **Sync from AD** (or automatic sync runs periodically)
3. New AD users appear with status "Pending Setup"
4. For each new user:
   - Assign a **Role**
   - Assign a **Department**
   - Configure **Access Scope**
5. Click **Save** to activate the user

### Manual User Creation

For organizations without AD or for system accounts:

1. Navigate to **Access Management → Users**
2. Click **Add User**
3. Enter required information:
   - **Email** (unique identifier)
   - **Full Name**
   - **Role**
   - **Department**
4. Set **Access Scope** (defaults based on role)
5. Click **Create User**

> [!NOTE]
> Manual users will receive login credentials via email or will need password reset on first login.

---

## 3. Role Assignment

### Available Roles

| Role | Category | Access Scope | Business Data | Approvals |
|------|----------|--------------|---------------|-----------|
| **CEO** | C-Suite | Global | ✅ Full | ✅ Can approve |
| **CFO** | C-Suite | Global | ✅ Full | ✅ Can approve |
| **CRO** | C-Suite | Global | ✅ Full + Risk Hub Config | ✅ Can approve |
| **COO** | C-Suite | Global | ❌ Limited | ❌ |
| **Risk Manager** | Governance | Global | ✅ Full | ✅ Can approve |
| **Compliance** | Governance | Global | ✅ Read | ✅ Can approve |
| **Legal** | Governance | Global | ✅ Read | ✅ Can approve |
| **Internal Audit** | Governance | Global | ✅ Read | ✅ Can approve |
| **Actuarial** | Governance | Global | ✅ Read | ✅ Can approve |
| **Department Head** | Department | Department | ✅ Department | ❌ Primary approver |
| **Employee** | Department | Department | ✅ Department | ❌ |
| **Administrator** | System | N/A | ❌ None | ❌ |
| **Viewer** | System | Varies | ✅ Read-only | ❌ |

### Assigning a Role

1. Find the user in **Access Management → Users**
2. Click **Edit** on the user row
3. Select the appropriate **Role** from the dropdown
4. Click **Save Changes**

> [!IMPORTANT]
> Changing a user's role takes effect immediately. Consider the impact on their pending work items.

### Role Selection Guidelines

| If the user needs to... | Assign role... |
|-------------------------|----------------|
| Configure system thresholds and risk types | CRO |
| Manage risks, controls, and KRIs organization-wide | Risk Manager |
| Review and approve requests without creating data | Compliance, Internal Audit |
| Manage their department's risks and approve department requests | Department Head |
| Submit KRI values and log control executions | Employee |
| Manage users, logs, and system health only | Administrator |

---

## 4. Department Assignment

### Why Department Matters

Department assignment determines:
- **What data the user can see** (for non-Global scopes)
- **Who is the fallback approver** (Department Head)
- **Default department for new entities** created by the user

### Assigning a Department

1. Find the user in **Access Management → Users**
2. Click **Edit**
3. Select a **Department** from the dropdown
4. Click **Save**

### Department Rules by Role

| Role Type | Department Required? | Access |
|-----------|---------------------|--------|
| C-Suite, Governance | Optional (informational only) | Global access regardless |
| Department Head | Required | Manages this department |
| Employee | Required | Sees only this department |
| Administrator | Not applicable | No business data access |

### Cross-Department Ownership

Even with department assignment, users can be assigned as owners of entities outside their department:

- **Risk Owner**: Can be assigned to any user, regardless of department
- **Control Owner**: Can be assigned to any user
- **KRI Reporting Owner**: Can be assigned to any user

When a user owns an entity outside their department:
- They can view and edit that specific entity
- They gain read access to linked entities (e.g., KRI owner can view linked Risk)
- They remain scoped to their department for all other data

---

## 5. Access Scope Configuration

### Access Scope Levels

| Scope | Value | Description | Typical Roles |
|-------|-------|-------------|---------------|
| **GLOBAL** | `global` | See all departments' data | C-Suite, Governance |
| **DEPARTMENT** | `department` | See only assigned department's data | Department Head, Employee |
| **MANAGER** | `manager` | See data via manager relationship | Delegated employees |

### How Access Scope Works

```
┌─────────────────────────────────────────────────────────────┐
│                    GLOBAL SCOPE                             │
│  Can see: All risks, controls, KRIs across all departments  │
│  Can approve: All requests (if role permits)                │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 DEPARTMENT SCOPE                            │
│  Can see: Only risks/controls/KRIs in their department      │
│  Can approve: Only their department's requests              │
│  Exception: Items they own (even in other departments)      │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   MANAGER SCOPE                             │
│  Can see: Same as their manager's scope                     │
│  Used for: Delegating access without changing role          │
└─────────────────────────────────────────────────────────────┘
```

### Configuring Access Scope

1. Navigate to **Access Management → Users**
2. Click **Edit** on the user
3. In the **Access Scope** section, select:
   - **Global**: Full organization visibility
   - **Department**: Limited to assigned department
   - **Manager**: Inherits manager's scope
4. Click **Save**

> [!NOTE]
> Access scope is typically set automatically based on role. Manual override is available for special cases.

---

## 6. Permission Matrix

### Understanding Permissions

Permissions are assigned to roles and determine specific actions users can perform:

| Permission | Description | Who Gets It |
|------------|-------------|-------------|
| `risks:read` | View risks | All (scoped by department) |
| `risks:write` | Create/edit risks | Risk Manager, CRO |
| `risks:delete` | Delete risks | Privileged (via approval) |
| `controls:read` | View controls | All (scoped) |
| `controls:write` | Create/edit controls | Risk Manager, CRO, Dept Head |
| `controls:execute` | Log control executions | Control Owner, Dept members |
| `kri:read` | View KRIs | All (scoped) |
| `kri:write` | Create/edit KRIs | Risk Manager, CRO |
| `kri:submit` | Submit KRI values | Reporting Owner, Risk Owner |
| `approvals:read` | View approval queue | All |
| `approvals:write` | Approve/reject requests | Privileged users only |
| `users:read` | View user list | Admin, CRO |
| `users:write` | Create/edit users | Admin only |
| `activity_log:read` | View activity log | Risk Manager, Compliance, Audit |

### Viewing User Permissions

1. Navigate to **Access Management → Permission Matrix**
2. View the grid showing all roles and their permissions
3. Use filters to focus on specific permission types

### Custom Permission Assignment

Individual user permissions can be customized if the default role permissions are insufficient:

1. Open user edit modal
2. Navigate to **Custom Permissions** tab
3. Toggle specific permissions on/off
4. Click **Save**

> [!WARNING]
> Customizing permissions can create confusion. Prefer adjusting roles where possible.

---

## 7. Deactivating Users

### When to Deactivate

- Employee leaves the organization
- User changes to a role with no system access
- Security incident requiring access revocation
- Temporary suspension

### Deactivation Process

1. Navigate to **Access Management → Users**
2. Find the user to deactivate
3. Click **Deactivate** (or toggle the Active switch)
4. Confirm the action

### What Happens on Deactivation

| Item | Effect |
|------|--------|
| **Login** | Immediately blocked |
| **Active sessions** | Terminated |
| **Owned entities** | Remain owned (should reassign) |
| **Pending approvals** | Remain (reassign to another approver) |
| **Historical records** | Preserved with user reference |

### Reactivating Users

1. Find the user (may need to toggle "Show Inactive" filter)
2. Click **Reactivate**
3. Review and update their role/department if needed
4. Click **Save**

### Handling Orphaned Entities

When deactivating a user who owns risks, controls, or KRIs:

1. Review **Orphaned Items** in the dashboard (Admin/CRO)
2. Reassign ownership to active users
3. Complete deactivation

---

## 8. Best Practices

### Role Assignment

1. **Principle of Least Privilege**: Assign the minimum role necessary
2. **Regular Reviews**: Audit user roles quarterly
3. **Documented Justification**: Keep records of why users have elevated roles

### Access Control

1. **Separation of Duties**: Administrators should not have business data access
2. **Department Alignment**: Ensure department assignments match organizational structure
3. **Owner Assignment**: Always assign entity owners; avoid orphaned items

### Security

1. **Prompt Deactivation**: Remove access immediately when employees leave
2. **Session Monitoring**: Review active sessions in Admin Console
3. **Audit Log Review**: Regularly review user activity for anomalies

### Common Mistakes to Avoid

| Mistake | Why It's a Problem | Solution |
|---------|-------------------|----------|
| Giving Admin role to see business data | Admin has no business data access | Use appropriate business role instead |
| Not assigning Department Head | No fallback approver for department | Always assign manager to departments |
| Leaving orphaned entities | No one responsible for updates | Reassign before user deactivation |
| Over-privileging users | Security and compliance risk | Use department scope appropriately |

---

## Next Steps

- [Configure Departments](./departments.md)
- [Understand Approvals](./approvals.md)
- [Run Reports](./reports.md)

---

*User management is restricted to Administrator and CRO roles.*
