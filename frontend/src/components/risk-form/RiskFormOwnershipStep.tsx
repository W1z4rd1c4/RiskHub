import { useId, useRef } from 'react';

import { Star, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import type { SafeTFunction } from '@/i18n/hooks';
import { getRoleLabel } from '@/lib/roleLabels';
import type { UserLookupItem } from '@/services/lookupApi';
import type { Risk } from '@/types/risk';

type TranslateFn = (
  key: string,
  optionsOrFallback?: string | Record<string, unknown>,
  fallback?: string,
) => string;

interface DepartmentLookup {
  id: number;
  name: string;
  code?: string;
}

interface RiskFormOwnershipStepProps {
  t: TranslateFn;
  formData: Partial<Risk>;
  fieldErrors: Record<string, string>;
  departments: DepartmentLookup[];
  ownerLookupStatus: 'loading' | 'ready' | 'error';
  ownerResultsLimited: boolean;
  ownerResultsHiddenByRole: boolean;
  retryOwnerSearch: () => void;
  selectOwner: (owner: UserLookupItem) => void;
  filteredUsers: UserLookupItem[];
  uniqueRoles: string[];
  ownerSearch: string;
  roleFilter: string;
  setOwnerSearch: (value: string) => void;
  setRoleFilter: (value: string) => void;
  handleInputChange: (field: keyof Risk, value: unknown) => void;
}

export function RiskFormOwnershipStep({
  t,
  formData,
  fieldErrors,
  departments,
  ownerLookupStatus,
  ownerResultsLimited,
  ownerResultsHiddenByRole,
  retryOwnerSearch,
  selectOwner,
  filteredUsers,
  uniqueRoles,
  ownerSearch,
  roleFilter,
  setOwnerSearch,
  setRoleFilter,
  handleInputChange,
}: RiskFormOwnershipStepProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const priorityLabelId = useId();
  const roleLabel = (role: string | null | undefined) => getRoleLabel(role, t as SafeTFunction);
  const selectedOwner = formData.owner?.id === formData.owner_id ? formData.owner : undefined;
  const selectedName = selectedOwner?.name || t('risks:form.owner_search.unknown_owner');
  const ownerError = (fieldErrors.owner_id || ownerLookupStatus === 'error') ? (
    <>
      {fieldErrors.owner_id && <span>{t(fieldErrors.owner_id, fieldErrors.owner_id)} </span>}
      {ownerLookupStatus === 'error' && <span role="alert">{t('risks:form.owner_search.failed')}</span>}
    </>
  ) : undefined;
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="grid md:grid-cols-2 gap-6">
        <Field
          label={t('common:labels.department')}
          required
          error={fieldErrors.department_id ? t(fieldErrors.department_id, fieldErrors.department_id) : undefined}
        >
          {(field) => (
            <ThemedSelect
              {...field}
              value={formData.department_id?.toString() ?? ''}
              onValueChange={(v) => handleInputChange('department_id', v ? parseInt(v, 10) : null)}
              placeholder={t('form.placeholders.select_department')}
              allowEmpty
              emptyLabel={t('form.placeholders.select_department')}
              className={fieldErrors.department_id ? 'border-destructive' : ''}
              options={departments.map((d) => ({ value: d.id.toString(), label: `${d.name} (${d.code})` }))}
            />
          )}
        </Field>
        <div>
          <Field
            label={t('risks:form.owner_search.label')}
            help={t('risks:form.owner_search.help')}
            error={ownerError}
          >
            {(field) => (
              <>
                {/* GAP-D-06: role chips show the translated role name; the code stays the filter value. */}
                <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label={t('risks:form.owner_search.role_filter')}>
                  <Button
                    size="compact"
                    variant={!roleFilter ? 'accent' : 'secondary'}
                    onClick={() => setRoleFilter('')}
                    aria-pressed={!roleFilter}
                  >
                    {t('common:labels.all')}
                  </Button>
                  {uniqueRoles.map((role) => (
                    <Button
                      key={role}
                      size="compact"
                      variant={roleFilter === role ? 'accent' : 'secondary'}
                      onClick={() => setRoleFilter(role)}
                      aria-pressed={roleFilter === role}
                    >
                      {roleLabel(role)}
                    </Button>
                  ))}
                </div>

                {formData.owner_id ? (
                  <div className={`flex items-center justify-between bg-accent/10 border rounded-xl px-4 py-3 ${fieldErrors.owner_id ? 'border-destructive' : 'border-accent/30'
                    }`}>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {selectedName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('risks:form.owner_search.selected')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="iconCompact"
                      aria-label={t('risks:form.owner_search.clear', { name: selectedName })}
                      onClick={() => {
                        handleInputChange('owner_id', null);
                        searchRef.current?.focus();
                      }}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
                <Input
                  ref={searchRef}
                  {...field}
                  type="text"
                  placeholder={t('form.placeholders.search_by_name')}
                  value={ownerSearch}
                  onChange={(e) => setOwnerSearch(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                  }}
                />
              </>
            )}
          </Field>
          <div className="space-y-2 mt-3">
            <div aria-busy={ownerLookupStatus === 'loading'} className={`max-h-40 overflow-y-auto rounded-xl border divide-y divide-border ${fieldErrors.owner_id ? 'border-destructive' : 'border-border'
              }`}>
              {ownerLookupStatus === 'loading' ? (
                <p role="status" className="px-4 py-3 text-sm text-muted-foreground">{t('risks:form.owner_search.loading')}</p>
              ) : ownerLookupStatus === 'error' ? (
                <div className="px-4 py-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    onClick={() => {
                      retryOwnerSearch();
                      searchRef.current?.focus();
                    }}
                    className="mt-2"
                  >
                    {t('common:actions.retry')}
                  </Button>
                </div>
              ) : filteredUsers.length === 0 ? (
                <p role="status" className="px-4 py-3 text-sm text-muted-foreground">{ownerResultsLimited || ownerResultsHiddenByRole ? t('risks:form.owner_search.no_visible_matches') : t('common:empty.no_users_found')}</p>
              ) : (
                filteredUsers.map((u) => (
                  <Button
                    key={u.id}
                    variant="ghost"
                    aria-pressed={formData.owner_id === u.id}
                    onClick={() => {
                      selectOwner(u);
                      searchRef.current?.focus();
                    }}
                    className="h-auto w-full justify-between rounded-none px-4 py-2.5 font-normal"
                  >
                    <span className="text-sm text-foreground">{u.name}</span>
                    <span className="text-xs text-muted-foreground">{roleLabel(u.role_name)}</span>
                  </Button>
                ))
              )}
            </div>
            {ownerLookupStatus === 'ready' && ownerResultsLimited && (
              <p role="status" className="text-xs text-muted-foreground">{t('risks:form.owner_search.refine')}</p>
            )}
          </div>

        </div>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          checked={Boolean(formData.is_priority)}
          onCheckedChange={(checked) => handleInputChange('is_priority', checked)}
          aria-labelledby={priorityLabelId}
          data-testid="risk-priority-switch"
        />
        <span id={priorityLabelId} className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Star aria-hidden="true" className={`h-4 w-4 ${formData.is_priority ? 'text-warning-text fill-warning-text' : 'text-muted-foreground'}`} />
          {t('risks:fields.is_priority')}
        </span>
      </div>
    </div>
  );
}
