import type { Dispatch, FormEventHandler, SetStateAction } from 'react';
import { Building2, Lock, Mail, Save, Shield, User as UserIcon } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import type { DepartmentSummary } from '@/services/departmentApi';
import type { RoleWithPermissions } from '@/types/access';
import type { UserCreate } from '@/types/user';

interface UserNewLocalFormProps {
    departments: DepartmentSummary[];
    formData: UserCreate;
    isLoading: boolean;
    onCancel: () => void;
    onSubmit: FormEventHandler<HTMLFormElement>;
    roles: RoleWithPermissions[];
    setFormData: Dispatch<SetStateAction<UserCreate>>;
}

export function UserNewLocalForm({
    departments,
    formData,
    isLoading,
    onCancel,
    onSubmit,
    roles,
    setFormData,
}: UserNewLocalFormProps) {
    const { t } = useTranslation(['admin', 'common']);

    return (
        <form onSubmit={onSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass-card p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                        <UserIcon className="h-5 w-5 text-accent" />
                        {t('user_new.personal_information', { ns: 'admin' })}
                    </h2>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">{t('user_new.full_name', { ns: 'admin' })}</label>
                        <div className="relative">
                            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                            <input
                                required
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/50"
                                placeholder={t('form.placeholders.name')}
                                value={formData.name}
                                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">{t('user_new.email_address', { ns: 'admin' })}</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                            <input
                                required
                                type="email"
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/50"
                                placeholder={t('form.placeholders.email')}
                                value={formData.email}
                                onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">{t('user_new.password', { ns: 'admin' })}</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                            <input
                                required
                                type="password"
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/50"
                                placeholder={t('form.placeholders.password')}
                                value={formData.password}
                                onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                            />
                        </div>
                    </div>
                </div>

                <div className="glass-card p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                        <Shield className="h-5 w-5 text-accent" />
                        {t('user_new.role_access', { ns: 'admin' })}
                    </h2>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">{t('user_new.platform_role', { ns: 'admin' })}</label>
                        <div className="relative">
                            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 pointer-events-none z-10" />
                            <ThemedSelect
                                value={formData.role_id.toString()}
                                onValueChange={(value) => setFormData({ ...formData, role_id: Number(value) })}
                                className="w-full pl-10"
                                options={roles.map((role) => ({ value: role.id.toString(), label: role.display_name }))}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">{t('common:labels.department')}</label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 pointer-events-none z-10" />
                            <ThemedSelect
                                value={formData.department_id?.toString() ?? ''}
                                onValueChange={(value) => setFormData({ ...formData, department_id: value ? Number(value) : null })}
                                placeholder={t('form.placeholders.no_department_scoping')}
                                allowEmpty
                                emptyLabel={t('form.placeholders.no_department_scoping')}
                                className="w-full pl-10"
                                options={departments.map((department) => ({ value: department.id.toString(), label: department.name }))}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-4">
                        <input
                            type="checkbox"
                            id="is_active"
                            className="w-5 h-5 rounded border-white/10 bg-white/5 text-accent focus:ring-accent/50 focus:ring-offset-0"
                            checked={formData.is_active}
                            onChange={(event) => setFormData({ ...formData, is_active: event.target.checked })}
                        />
                        <label htmlFor="is_active" className="text-sm font-medium text-slate-300">
                            {t('user_new.active_immediately', { ns: 'admin' })}
                        </label>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-4">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-6 py-2 rounded-xl text-slate-300 hover:bg-white/5 transition-all"
                >
                    {t('actions.cancel', { ns: 'common' })}
                </button>
                <button
                    disabled={isLoading}
                    className="bg-accent hover:bg-accent/80 disabled:opacity-50 text-white px-8 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-accent/20 transition-all active:scale-95"
                >
                    {isLoading ? (
                        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : <Save className="h-5 w-5" />}
                    {t('users.create_user', { ns: 'admin' })}
                </button>
            </div>
        </form>
    );
}
