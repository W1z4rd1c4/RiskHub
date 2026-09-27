import { useRef } from 'react';

import { Star, X } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
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
  const selectedOwner = formData.owner?.id === formData.owner_id ? formData.owner : undefined;
  const selectedName = selectedOwner?.name || t('risks:form.owner_search.unknown_owner');
  const ownerError = (fieldErrors.owner_id || ownerLookupStatus === 'error') ? (
    <>
      {fieldErrors.owner_id && <span>{fieldErrors.owner_id} </span>}
      {ownerLookupStatus === 'error' && <span role="alert">{t('risks:form.owner_search.failed')}</span>}
    </>
  ) : undefined;
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="grid md:grid-cols-2 gap-6">
        <Field
          label={t('common:labels.department')}
          required
          error={fieldErrors.department_id || undefined}
          labelClassName="block text-[10px] font-black text-slate-500 uppercase tracking-widest"
        >
          {(field) => (
            <ThemedSelect
              {...field}
              value={formData.department_id?.toString() ?? ''}
              onValueChange={(v) => handleInputChange('department_id', v ? parseInt(v, 10) : null)}
              placeholder={t('form.placeholders.select_department')}
              allowEmpty
              emptyLabel={t('form.placeholders.select_department')}
              className={fieldErrors.department_id ? 'border-rose-500' : ''}
              options={departments.map((d) => ({ value: d.id.toString(), label: `${d.name} (${d.code})` }))}
            />
          )}
        </Field>
        <div>
          <Field
            label={t('risks:form.owner_search.label')}
            help={t('risks:form.owner_search.help')}
            error={ownerError}
            labelClassName="block text-[10px] font-black text-slate-500 uppercase tracking-widest"
          >
            {(field) => (
              <>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <button
                    type="button"
                    onClick={() => setRoleFilter('')}
                    aria-pressed={!roleFilter}
                    className={`px-2.5 py-1 text-xs rounded-lg transition-all ${!roleFilter
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                  >
                    {t('common:labels.all')}
                  </button>
                  {uniqueRoles.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setRoleFilter(role)}
                      aria-pressed={roleFilter === role}
                      className={`px-2.5 py-1 text-xs rounded-lg transition-all capitalize ${roleFilter === role
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10'
                        }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>

                {formData.owner_id ? (
                  <div className={`flex items-center justify-between bg-accent/10 border rounded-xl px-4 py-3 ${fieldErrors.owner_id ? 'border-rose-500' : 'border-accent/30'
                    }`}>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {selectedName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {t('risks:form.owner_search.selected')}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={t('risks:form.owner_search.clear', { name: selectedName })}
                      onClick={() => {
                        handleInputChange('owner_id', null);
                        searchRef.current?.focus();
                      }}
                      className="text-slate-400 hover:text-white p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
                <input
                  ref={searchRef}
                  {...field}
                  type="text"
                  placeholder={t('form.placeholders.search_by_name')}
                  value={ownerSearch}
                  onChange={(e) => setOwnerSearch(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-accent/50 transition-all"
                />
              </>
            )}
          </Field>
          <div className="space-y-2 mt-3">
            <div aria-busy={ownerLookupStatus === 'loading'} className={`max-h-40 overflow-y-auto rounded-xl border divide-y divide-white/5 ${fieldErrors.owner_id ? 'border-rose-500' : 'border-white/10'
              }`}>
              {ownerLookupStatus === 'loading' ? (
                <p role="status" className="px-4 py-3 text-sm text-muted-foreground">{t('risks:form.owner_search.loading')}</p>
              ) : ownerLookupStatus === 'error' ? (
                <div className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      retryOwnerSearch();
                      searchRef.current?.focus();
                    }}
                    className="btn-secondary mt-2"
                  >
                    {t('common:actions.retry')}
                  </button>
                </div>
              ) : filteredUsers.length === 0 ? (
                <p role="status" className="px-4 py-3 text-sm text-muted-foreground">{ownerResultsLimited || ownerResultsHiddenByRole ? t('risks:form.owner_search.no_visible_matches') : t('common:empty.no_users_found')}</p>
              ) : (
                filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    aria-pressed={formData.owner_id === u.id}
                    onClick={() => {
                      selectOwner(u);
                      searchRef.current?.focus();
                    }}
                    className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/5 transition-colors"
                  >
                    <span className="text-sm text-white">{u.name}</span>
                    <span className="text-xs text-slate-500 capitalize">{u.role_name}</span>
                  </button>
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
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className={`relative w-12 h-6 rounded-full transition-all ${formData.is_priority ? 'bg-accent' : 'bg-white/10'}`}>
            <input
              type="checkbox"
              className="sr-only"
              checked={formData.is_priority}
              onChange={(e) => handleInputChange('is_priority', e.target.checked)}
            />
            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.is_priority ? 'translate-x-6' : 'translate-x-0'}`} />
          </div>
          <div className="flex items-center gap-1.5">
            <Star className={`h-4 w-4 ${formData.is_priority ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-300 transition-colors">{t('risks:fields.is_priority')}</span>
          </div>
        </label>
      </div>
    </div>
  );
}
