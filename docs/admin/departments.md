# Department Management

> **Audience**: Administrator, CRO  
> **Location**: Sidebar → Departments (view) | Access Management (manage)

---

## Table of Contents

1. [Understanding Departments](#1-understanding-departments)
2. [Creating Departments](#2-creating-departments)
3. [Department Hierarchies](#3-department-hierarchies)
4. [Assigning Department Heads](#4-assigning-department-heads)
5. [Handling Orphaned Items](#5-handling-orphaned-items)
6. [Deactivating Departments](#6-deactivating-departments)
7. [Best Practices](#7-best-practices)

---

## 1. Understanding Departments

Departments are the primary organizational unit in RiskHub, determining data visibility and approval authority.

### Department Purpose

| Function | Description |
|----------|-------------|
| **Data Scoping** | Non-privileged users see only their department's risks, controls, and KRIs |
| **Approval Routing** | Department Head is fallback approver for department entities |
| **Reporting** | Dashboard metrics can be filtered by department |
| **Ownership** | Entities belong to departments for organizational accountability |

### Department Structure

```
┌─────────────────────────────────────────────────────────────┐
│                      DEPARTMENT                             │
│  ID: Unique identifier                                      │
│  Name: Display name (e.g., "Information Technology")        │
│  Manager ID: → Department Head (User)                       │
│  Is Active: Boolean (soft delete)                           │
│  Is System: Boolean (cannot be deleted)                     │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────┐         ┌──────────┐         ┌─────────┐
    │  USERS  │         │  RISKS   │         │ CONTROLS│
    │ dept_id │         │ dept_id  │         │ dept_id │
    └─────────┘         └──────────┘         └─────────┘
```

### System Departments

RiskHub includes protected system departments that cannot be deleted:
- These may include default departments for unassigned items
- System departments have `is_system = true`
- You can edit their name and manager, but not delete them

---

## 2. Creating Departments

### Prerequisites

Only these roles can create departments:
- **Administrator**
- **CRO**

### Creating a New Department

1. Navigate to **Access Management → Departments** (or **Departments** page for CRO)
2. Click **Create Department**
3. Enter the required information:
   - **Department Name**: Unique, descriptive name
   - **Department Head**: Select a user with Department Head role (optional but recommended)
   - **Description** (optional): Purpose or scope of department
4. Click **Create**

### Department Naming Conventions

| Good | Avoid |
|------|-------|
| "Information Technology" | "IT" (too short) |
| "Human Resources" | "HR Dept" (abbreviation) |
| "Finance and Accounting" | "Finance/Accounting" (special characters) |
| "Risk Management Office" | "RMO" (abbreviation) |

> [!TIP]
> Use full, descriptive names. The system displays department names in reports and dashboards.

---

## 3. Department Hierarchies

### Current Implementation

RiskHub currently implements a **flat department structure**:
- All departments are at the same level
- No parent-child relationships between departments
- Global users see all departments equally

### Organizational Hierarchy Workaround

If your organization has hierarchical departments, consider:

1. **Naming Convention**: Use prefixes (e.g., "Corporate > IT", "Corporate > HR")
2. **Tagging**: Use description field for hierarchy info
3. **Reporting**: Group departments manually in exports

### Cross-Department Visibility

Users can access entities outside their department if they are:
- **Risk Owner** of a risk in another department
- **Control Owner** of a control in another department
- **KRI Reporting Owner** with linked risk in another department

This enables organizational flexibility while maintaining data boundaries.

---

## 4. Assigning Department Heads

### Department Head Role

The Department Head serves as:
- **Primary approver** for department entities when no specific owner
- **Fallback approver** when risk/control owner is unavailable
- **Department administrator** for their area

### Requirements for Department Head

| Requirement | Description |
|-------------|-------------|
| **Role** | Must have "Department Head" role assigned |
| **Status** | Must be an active user |
| **Department** | Should be assigned to the same department they manage |

### Assigning a Department Head

1. Navigate to **Access Management → Departments**
2. Find the department
3. Click **Edit**
4. In the **Department Head** dropdown, select the user
5. Click **Save**

### Multiple Managers

Each department has exactly **one** Department Head (manager). If backup approvers are needed:
- The approval workflow escalates to privileged users automatically
- Consider assigning Risk Manager role to backup personnel

### Changing Department Head

When changing the Department Head:

1. Existing pending approvals remain with the original approver
2. New requests will route to the new Department Head
3. Consider reassigning pending approvals manually if urgent

---

## 5. Handling Orphaned Items

### What Are Orphaned Items?

Orphaned items are entities without a valid owner or department assignment:

| Orphan Type | Cause | Impact |
|-------------|-------|--------|
| **No Owner** | User deactivated, owner_id → NULL | No primary approver |
| **No Department** | Department deactivated | Access control issues |
| **No Department Head** | Manager deactivated | No fallback approver |

### Orphan Detection

RiskHub provides an **Orphaned Items** dashboard for Admin/CRO:

1. Navigate to **Dashboard** or **Admin Console**
2. Look for the **Orphaned Items** widget
3. View counts of:
   - Risks without owner
   - Controls without owner
   - KRIs without reporting owner
   - Departments without manager

### Resolving Orphans

#### Risks Without Owner

1. Navigate to **Risks** page
2. Filter by "No Owner" or use the orphan widget
3. For each unowned risk:
   - Click **Edit**
   - Assign a new **Risk Owner**
   - Click **Save**

#### Controls Without Owner

1. Navigate to **Controls** page
2. Filter by "No Owner"
3. Assign new **Control Owner** to each

#### KRIs Without Reporting Owner

1. Navigate to **Risk Appetite**
2. Filter KRIs without reporting owner
3. Assign **Reporting Owner** or ensure linked Risk has owner (fallback)

#### Departments Without Manager

1. Navigate to **Access Management → Departments**
2. Edit departments flagged as "No Manager"
3. Assign active user as Department Head

### Preventing Orphans

Before deactivating a user:

1. Run the **Owned Items Report** for that user
2. Reassign ownership of all their entities
3. Then proceed with deactivation

> [!WARNING]
> The system will warn you if deactivating a user would create orphaned items. Resolve ownership first.

---

## 6. Deactivating Departments

### When to Deactivate

- Department restructuring
- Merger or acquisition
- Department consolidated into another

### Deactivation Prerequisites

Before deactivating a department:

1. **Reassign users** to other departments
2. **Reassign or archive risks** owned by the department
3. **Reassign or archive controls** owned by the department
4. **Verify no active KRIs** link to department risks

### Deactivation Process

1. Navigate to **Access Management → Departments**
2. Find the department to deactivate
3. Click **Deactivate** (or toggle Active switch)
4. Confirm the action

### Effects of Deactivation

| Item | Effect |
|------|--------|
| **Department visibility** | Hidden from dropdowns and filters |
| **Existing entities** | Retain department_id (historical reference) |
| **Users in department** | Should be reassigned (or deactivated) |
| **Reports** | Historical data preserved with department name |

### Reactivating Departments

1. Toggle "Show Inactive" filter
2. Find the deactivated department
3. Click **Reactivate**
4. Assign Department Head if needed
5. Reassign users if applicable

---

## 7. Best Practices

### Department Structure

1. **Align with organization chart**: Departments should mirror your actual organizational structure
2. **One-to-one mapping**: Each real department should have exactly one RiskHub department
3. **Clear ownership**: Every department should have an assigned Department Head

### Naming

1. **Be consistent**: Use the same naming convention across all departments
2. **Be descriptive**: Full names are clearer than abbreviations
3. **Avoid duplicates**: Names should be unique and distinguishable

### Maintenance

1. **Regular audits**: Review departments quarterly for accuracy
2. **Prompt updates**: Update when organizational changes occur
3. **Orphan checks**: Run orphan detection weekly

### Common Mistakes to Avoid

| Mistake | Problem | Solution |
|---------|---------|----------|
| Too many departments | Fragmented data, complex reporting | Consolidate where appropriate |
| No Department Heads | Approval workflow fails | Always assign managers |
| Deactivating before migration | Creates orphans | Migrate data first |
| Abbreviations | Unclear in reports | Use full names |

### Example Department Setup

For a mid-sized organization:

| Department | Head Role | Typical Entities |
|------------|-----------|------------------|
| Executive Office | CRO (optional) | Strategic risks |
| Information Technology | IT Department Head | IT controls, cyber risks |
| Finance | Finance Department Head | Financial controls, financial risks |
| Operations | Ops Department Head | Operational risks, process controls |
| Human Resources | HR Department Head | HR-related risks |
| Legal & Compliance | Compliance (privileged) | Regulatory risks |
| Risk Management | Risk Manager | Risk governance, KRIs |

---

## Next Steps

- [Understand Approvals](./approvals.md)
- [Run Reports](./reports.md)

---

*Department management is restricted to Administrator and CRO roles.*
