import { Plus, Search, User, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/state';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import type { SafeTFunction } from '@/i18n/hooks';
import { getRoleLabel } from '@/lib/roleLabels';
import type { UserLookupItem } from '@/services/lookupApi';
import type { Control } from '@/types/control';

interface DepartmentOption {
  id: number;
  name: string;
  code: string;
}

type TranslateFn = (
  key: string,
  optionsOrFallback?: string | Record<string, unknown>,
  fallback?: string,
) => string;

interface ControlFormOwnershipStepProps {
  t: TranslateFn;
  isLoadingLookups: boolean;
  formData: Partial<Control>;
  /** Per-field validation messages (AX-04). */
  fieldErrors?: Partial<Record<keyof Control, string>>;
  departments: DepartmentOption[];
  users: UserLookupItem[];
  filteredUsers: UserLookupItem[];
  uniqueRoles: string[];
  roleFilter: string;
  ownerSearch: string;
  setRoleFilter: (value: string) => void;
  setOwnerSearch: (value: string) => void;
  handleInputChange: (field: keyof Control, value: unknown) => void;
}

export function ControlFormOwnershipStep({
  t,
  isLoadingLookups,
  formData,
  fieldErrors = {},
  departments,
  users,
  filteredUsers,
  uniqueRoles,
  roleFilter,
  ownerSearch,
  setRoleFilter,
  setOwnerSearch,
  handleInputChange,
}: ControlFormOwnershipStepProps) {
  const roleLabel = (role: string | null | undefined) => getRoleLabel(role, t as SafeTFunction);
  const selectedOwner = formData.control_owner_id ? users.find((u) => u.id === formData.control_owner_id) : undefined;

  if (isLoadingLookups) {
    return <LoadingState layout="inline" label={t('loading.generic', { ns: 'common' })} />;
  }

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div className="space-y-4">
        <Field label={t('common:labels.department')} required error={fieldErrors.department_id}>
          {(field) => (
            <ThemedSelect
              {...field}
              value={formData.department_id?.toString() ?? ''}
              onValueChange={(v) => handleInputChange('department_id', v ? parseInt(v, 10) : undefined)}
              placeholder={t('form.placeholders.select_department')}
              allowEmpty
              emptyLabel={t('form.placeholders.select_department')}
              className="w-full"
              options={departments.map((dept) => ({ value: dept.id.toString(), label: `${dept.name} (${dept.code})` }))}
            />
          )}
        </Field>
        <Field label={t('controls:form.labels.owner_position')} required error={fieldErrors.process_owner_position}>
          {(field) => (
            <Input
              {...field}
              type="text"
              value={formData.process_owner_position || ''}
              onChange={(e) => handleInputChange('process_owner_position', e.target.value)}
              placeholder={t('form.placeholders.process_owner_position')}
            />
          )}
        </Field>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium text-foreground">
          {t('controls:fields.owner')}
          <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
        </h3>
        {fieldErrors.control_owner_id ? (
          <p role="alert" className="mb-3 text-xs font-medium text-destructive">{fieldErrors.control_owner_id}</p>
        ) : null}

        {/* GAP-D-06: role chips show the translated role name; the code stays the filter value. */}
        <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label={t('risks:form.owner_search.role_filter')}>
          <Button
            size="compact"
            variant={!roleFilter ? 'accent' : 'secondary'}
            aria-pressed={!roleFilter}
            onClick={() => setRoleFilter('')}
          >
            {t('common:labels.all')}
          </Button>
          {uniqueRoles.map((role) => (
            <Button
              key={role}
              size="compact"
              variant={roleFilter === role ? 'accent' : 'secondary'}
              aria-pressed={roleFilter === role}
              onClick={() => {
                setRoleFilter(role);
                const usersWithRole = users.filter((u) => u.role_name === role);
                if (usersWithRole.length === 1) {
                  handleInputChange('control_owner_id', usersWithRole[0].id);
                } else {
                  handleInputChange('control_owner_id', undefined);
                  handleInputChange('department_id', undefined);
                }
              }}
            >
              {roleLabel(role)}
            </Button>
          ))}
        </div>

        {formData.control_owner_id ? (
          <div className="flex items-center justify-between bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                <User className="h-4 w-4 text-accent-text" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">
                  {selectedOwner?.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedOwner?.email}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="iconCompact"
              onClick={() => handleInputChange('control_owner_id', undefined)}
              aria-label={t('common:actions.clear_selection_named', {
                name: selectedOwner?.name ?? t('common:fallbacks.unknown_user'),
              })}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              type="text"
              leadingIcon={Search}
              aria-label={t('form.placeholders.search_owners')}
              placeholder={t('form.placeholders.search_owners')}
              value={ownerSearch}
              onChange={(e) => setOwnerSearch(e.target.value)}
            />
            <div className="max-h-[160px] overflow-y-auto rounded-xl border border-border divide-y divide-border custom-scrollbar bg-tint/[0.03]">
              {filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground italic">{t('common:empty.no_owners_found')}</div>
              ) : (
                filteredUsers.map((user) => (
                  <Button
                    key={user.id}
                    variant="ghost"
                    onClick={() => handleInputChange('control_owner_id', user.id)}
                    className="group h-auto w-full justify-between rounded-none px-4 py-2.5 text-left font-normal"
                  >
                    <span>
                      <span className="block text-sm font-medium text-foreground">{user.name}</span>
                      <span className="block text-xs text-muted-foreground group-hover:text-foreground transition-colors">{roleLabel(user.role_name)}</span>
                    </span>
                    <Plus className="h-3 w-3 text-muted-foreground group-hover:text-accent-text transition-colors" aria-hidden="true" />
                  </Button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
