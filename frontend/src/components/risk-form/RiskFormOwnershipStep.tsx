import { AlertCircle, Star, X } from 'lucide-react';

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
  users: UserLookupItem[];
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
  users,
  filteredUsers,
  uniqueRoles,
  ownerSearch,
  roleFilter,
  setOwnerSearch,
  setRoleFilter,
  handleInputChange,
}: RiskFormOwnershipStepProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
            {t('common:labels.department')} <span className="text-rose-400">*</span>
          </label>
          <ThemedSelect
            value={formData.department_id?.toString() ?? ''}
            onValueChange={(v) => handleInputChange('department_id', v ? parseInt(v, 10) : null)}
            placeholder={t('form.placeholders.select_department')}
            allowEmpty
            emptyLabel={t('form.placeholders.select_department')}
            className={fieldErrors.department_id ? 'border-rose-500' : ''}
            options={departments.map((d) => ({ value: d.id.toString(), label: `${d.name} (${d.code})` }))}
          />
          {fieldErrors.department_id && (
            <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {fieldErrors.department_id}
            </p>
          )}
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
            {t('risks:fields.owner')} <span className="text-rose-400">*</span>
          </label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            <button
              type="button"
              onClick={() => {
                setRoleFilter('');
                handleInputChange('owner_id', null);
              }}
              className={`px-2.5 py-1 text-xs rounded-lg transition-all ${!roleFilter
                ? 'bg-accent text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                }`}
            >
              All
            </button>
            {uniqueRoles.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => {
                  setRoleFilter(role);
                  const usersWithRole = users.filter((u) => u.role_name === role);
                  if (usersWithRole.length === 1) {
                    handleInputChange('owner_id', usersWithRole[0].id);
                  } else {
                    handleInputChange('owner_id', null);
                    handleInputChange('department_id', null);
                  }
                }}
                className={`px-2.5 py-1 text-xs rounded-lg transition-all capitalize ${roleFilter === role
                  ? 'bg-accent text-white'
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
                  {users.find((u) => u.id === formData.owner_id)?.name}
                </p>
                <p className="text-xs text-slate-400">
                  {users.find((u) => u.id === formData.owner_id)?.role_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleInputChange('owner_id', null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                placeholder={t('form.placeholders.search_by_name')}
                value={ownerSearch}
                onChange={(e) => setOwnerSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-accent/50 transition-all"
              />
              <div className={`max-h-40 overflow-y-auto rounded-xl border divide-y divide-white/5 ${fieldErrors.owner_id ? 'border-rose-500' : 'border-white/10'
                }`}>
                {filteredUsers.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-500">{t('common:empty.no_users_found')}</p>
                ) : (
                  filteredUsers.slice(0, 8).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleInputChange('owner_id', u.id)}
                      className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/5 transition-colors"
                    >
                      <span className="text-sm text-white">{u.name}</span>
                      <span className="text-xs text-slate-500 capitalize">{u.role_name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
          {fieldErrors.owner_id && (
            <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {fieldErrors.owner_id}
            </p>
          )}
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
