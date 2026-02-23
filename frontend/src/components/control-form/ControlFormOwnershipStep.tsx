import { Plus, User, X } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
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
  if (isLoadingLookups) {
    return <div className="text-slate-500 text-sm">{t('loading.generic', { ns: 'common' })}</div>;
  }

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div>
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{t('common:labels.department')}</label>
        <div className="grid grid-cols-1 gap-2">
          <ThemedSelect
            value={formData.department_id?.toString() ?? ''}
            onValueChange={(v) => handleInputChange('department_id', v ? parseInt(v, 10) : undefined)}
            placeholder={t('form.placeholders.select_department')}
            allowEmpty
            emptyLabel={t('form.placeholders.select_department')}
            className="w-full"
            options={departments.map((dept) => ({ value: dept.id.toString(), label: `${dept.name} (${dept.code})` }))}
          />
          <div className="mt-4">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t('controls:form.labels.owner_position')}</label>
            <input
              type="text"
              value={formData.process_owner_position || ''}
              onChange={(e) => handleInputChange('process_owner_position', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-600"
              placeholder={t('form.placeholders.process_owner_position')}
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{t('controls:fields.owner')}</label>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => setRoleFilter('')}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${!roleFilter
              ? 'bg-accent text-white shadow-lg shadow-accent/30'
              : 'bg-white/5 text-slate-500 hover:bg-white/10'
              }`}
          >
            {t('common:labels.all')}
          </button>
          {uniqueRoles.map((role) => (
            <button
              key={role}
              type="button"
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
              className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${roleFilter === role
                ? 'bg-accent text-white shadow-lg shadow-accent/30'
                : 'bg-white/5 text-slate-500 hover:bg-white/10'
                }`}
            >
              {role}
            </button>
          ))}
        </div>

        {formData.control_owner_id ? (
          <div className="flex items-center justify-between bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                <User className="h-4 w-4 text-accent" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  {users.find((u) => u.id === formData.control_owner_id)?.name}
                </p>
                <p className="text-[10px] text-slate-400">
                  {users.find((u) => u.id === formData.control_owner_id)?.email}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleInputChange('control_owner_id', undefined)}
              className="p-1 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              placeholder={t('form.placeholders.search_owners')}
              value={ownerSearch}
              onChange={(e) => setOwnerSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-600"
            />
            <div className="max-h-[160px] overflow-y-auto rounded-xl border border-white/5 divide-y divide-white/5 custom-scrollbar bg-white/[0.02]">
              {filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 italic">{t('common:empty.no_owners_found')}</div>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleInputChange('control_owner_id', user.id)}
                    className="w-full px-4 py-2.5 text-left hover:bg-white/5 transition-all flex items-center justify-between group"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{user.name}</p>
                      <p className="text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors uppercase tracking-widest">{user.role_name}</p>
                    </div>
                    <Plus className="h-3 w-3 text-slate-700 group-hover:text-accent transition-colors" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
