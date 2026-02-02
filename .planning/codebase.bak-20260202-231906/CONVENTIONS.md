# Code Conventions

## Backend (Python)

### File Organization

| Category | Location | Count |
|----------|----------|-------|
| Routers | `backend/app/api/v1/endpoints/*.py` | 21 modules |
| Dependencies | `backend/app/api/deps.py` | 1 file |
| Security | `backend/app/core/security.py` | 1 file |
| Models | `backend/app/models/*.py` | 19 modules |
| Schemas | `backend/app/schemas/*.py` | 18 modules |
| Services | `backend/app/services/*.py` | 10 modules |

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Functions/Variables | snake_case | `get_user_department_ids()` |
| Classes | PascalCase | `ApprovalRequest` |
| Constants | UPPER_SNAKE_CASE | `SENSITIVE_FIELDS` |
| Enums | PascalCase + UPPER values | `ApprovalStatus.PENDING` |
| API Endpoints | kebab-case URLs | `/approval-requests` |
| JSON Fields | snake_case | `department_id` |
| Config Keys | snake_case | `high_risk_min_net_score` |

### Async Patterns

```python
# Database dependency injection
async def get_risk(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    ...

# Atomic operations with retry
async with db.begin_nested():
    result = await db.execute(select(...).with_for_update())
```

### Permission Checking

```python
# Decorator style (blocks if missing)
@router.post("/")
async def create_risk(
    current_user: User = Depends(require_permission("risks", "write")),
): ...

# Function style (returns bool)
if not check_permission(current_user, "risks", "delete"):
    raise HTTPException(403)
```

### Activity Logging Pattern

```python
# Always in same transaction as business change
await log_activity(
    db=db,
    entity_type=ActivityEntityType.RISK,
    entity_id=risk.id,
    entity_name=risk.name,
    action=ActivityAction.UPDATE,
    actor=current_user,
    department_id=risk.department_id,
    changes=build_change_set(old_data, new_data),
    description=f"Updated risk '{risk.name}'"
)
```

### Approval Helper Pattern

```python
# Consolidated approval creation
from app.core.approval_helpers import create_approval_request_with_audit

await create_approval_request_with_audit(
    db=db,
    resource_type=ApprovalResourceType.RISK,
    resource_id=risk.id,
    resource_name=risk.name,
    action_type=ApprovalActionType.EDIT,
    pending_changes=pending_changes,
    reason="User requested change",
    requester=current_user,
    primary_approver=risk_owner,
    requires_privileged=is_high_risk,
)
```

## Frontend (TypeScript/React)

### File Organization

| Category | Location | Count |
|----------|----------|-------|
| Pages | `frontend/src/pages/*.tsx` | 28 files |
| Components | `frontend/src/components/<category>/*.tsx` | 90+ |
| Hooks | `frontend/src/hooks/*.ts` | 8 files |
| Services | `frontend/src/services/*Api.ts` | 20 files |
| Types | `frontend/src/types/*.ts` | 12 files |
| i18n | `frontend/src/i18n/locales/{en,cs}/*.json` | 10 per locale |

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files/Components | PascalCase.tsx | `RiskForm.tsx` |
| Hooks | useCamelCase.ts | `useDepartmentDetail.ts` |
| Services | camelCaseApi.ts | `riskApi.ts` |
| Types/Interfaces | PascalCase | `interface Risk` |
| API response fields | snake_case (matches backend) | `department_id` |
| i18n Keys | namespace.section.key | `common.loading.generic` |

### Component Patterns

```tsx
// Functional component with typed props
interface RiskCardProps {
  risk: Risk;
  onEdit?: (id: number) => void;
  showControls?: boolean;
}

export function RiskCard({ risk, onEdit, showControls = true }: RiskCardProps) {
  const { t } = useTranslation(['risks', 'common']);
  ...
}
```

### API Client Pattern

```typescript
// services/apiClient.ts handles:
// - Bearer token injection
// - Error parsing
// - 202 approval detection

import { parseUpdateResult } from '@/lib/approvalUi';

const result = await riskApi.update(id, data);
const { approvalCreated, toast } = parseUpdateResult(result, t);
if (approvalCreated) {
  showToast(toast);
}
```

### Permission Gating

```tsx
<PermissionGate resource="risks" action="write">
  <Button onClick={handleCreate}>Create Risk</Button>
</PermissionGate>

// Hook style
const { can } = usePermissions();
if (can('risks', 'delete')) { ... }
```

### i18n Usage

```tsx
// Namespace imports
const { t } = useTranslation(['risks', 'common']);

// Key interpolation
t('risks.form.title', { name: risk.name })

// Plural forms
t('common.items', { count: items.length })
```

## Shared Conventions

### API Versioning

- All routes under `/api/v1`
- Response format: `{ data, meta? }` or `{ detail }` for errors

### Date/Time Handling

- ISO 8601 in API (`2026-01-17T10:30:00Z`)
- `date-fns` for frontend formatting
- Timezone-aware `datetime.now(UTC)` in backend

### Error Response Format

```json
{
  "detail": "Resource not found"
}
```

### Import Alias

- `@` → `frontend/src` (Vite config)
- Used for absolute imports: `import { Button } from '@/components/ui'`

## Simplification Patterns

### Backend Helpers

| Pattern | Description | Examples |
|---------|-------------|----------|
| Service helpers | Extract repeated patterns | `_already_flagged()`, `_create_orphan()` |
| Sentinel values | Distinguish None vs unset | `_NOT_PROVIDED = object()` |
| Inline → modules | Move inline schemas to files | `schemas/riskhub.py` |
| Consolidated approvals | Unified creation logic | `create_approval_request_with_audit()` |
| Resource assertion | Scope-aware access check | `_assert_department_in_scope()` |
| Query builders | Extract complex queries | `_build_controls_query()` |
| Streaming helpers | Unified streaming | `_stream_pdf()`, `_stream_excel()` |

### Frontend Patterns

| Pattern | Description | Examples |
|---------|-------------|----------|
| Data-fetching hooks | Multi-endpoint loading | `useDepartmentDetail` |
| Page orchestrator | Main owns state, subs present | `LinkManagementDialog` |
| Presentational subs | Extract complex sections | `linking/LinkSearchPanel` |
| Reusable UI | Extract duplicated components | `StepIndicator.tsx` |
| Explicit types | Replace `Record<string, unknown>` | `SearchResultItem` |
| Theme-aware charts | Dynamic theme colors | `useChartTheme()` hook |

---
*Updated: 2026-01-17*
