import React, { useState, useEffect, useCallback } from 'react';
import {
    UserPlus,
    ArrowLeft,
    Save,
    Mail,
    User as UserIcon,
    Shield,
    Building2,
    Lock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { accessApi } from '@/services/accessApi';
import { userApi } from '@/services/userApi';
import { apiClient } from '@/services/apiClient';
import { departmentApi } from '@/services/departmentApi';
import type { DepartmentSummary } from '@/services/departmentApi';
import type { AuthConfigResponse } from '@/services/authApi';
import { getAuthConfig } from '@/services/authConfig';
import { isAuthUnavailableError } from '@/services/authRequest';
import type { RoleWithPermissions } from '@/types/access';
import type { UserCreate } from '@/types/user';
import type { DirectoryImportResponse } from '@/types/directory';
import { usePermissions } from '@/hooks/usePermissions';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { DirectoryUserImportPanel } from '@/components/users/DirectoryUserImportPanel';
import { useTranslation } from '@/i18n/hooks';

// Safe roles that can be selected by default (non-privileged)
const SAFE_ROLE_NAMES = ['control_owner', 'viewer', 'department_head'];
// Privileged roles that should never be auto-selected
const PRIVILEGED_ROLE_NAMES = ['admin', 'cro', 'risk_manager'];

export function UserNewPage() {
    const navigate = useNavigate();
    const { t } = useTranslation(['admin', 'common', 'errorKeys']);
    const { canManageUsers } = usePermissions();
    const [authConfig, setAuthConfig] = useState<AuthConfigResponse | null>(null);
    const [isAuthConfigLoading, setIsAuthConfigLoading] = useState(true);
    const [authConfigError, setAuthConfigError] = useState<string | null>(null);
    const [isDirectoryProviderUnavailable, setIsDirectoryProviderUnavailable] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
    const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
    const [formData, setFormData] = useState<UserCreate>({
        email: '',
        name: '',
        password: '',
        role_id: 0, // Will be set to safe role once fetched
        department_id: null,
        manager_id: null,
        is_active: true
    });
    const [errorKey, setErrorKey] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            try {
                const config = await getAuthConfig();
                if (cancelled) return;
                setAuthConfig(config);
            } catch (err) {
                if (cancelled) return;
                console.error('Failed to load auth mode:', err);
                setAuthConfigError(
                    isAuthUnavailableError(err)
                        ? t('user_new.auth_mode_service_unavailable', {
                            ns: 'admin',
                            defaultValue: 'Authentication mode is temporarily unavailable. Refresh after the auth service is reachable again.',
                        })
                        : (err instanceof Error ? err.message : String(err)),
                );
            } finally {
                if (!cancelled) {
                    setIsAuthConfigLoading(false);
                }
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [t]);

    const fetchRoles = useCallback(async () => {
        try {
            const data = await accessApi.listAccessRoles();
            setRoles(data);

            // Find the safest default role (control_owner preferred, then viewer, then department_head)
            let defaultRole: RoleWithPermissions | undefined;
            for (const safeName of SAFE_ROLE_NAMES) {
                defaultRole = data.find(r => r.name === safeName);
                if (defaultRole) break;
            }

            // If still no safe role found, filter out privileged roles and pick first non-privileged
            if (!defaultRole) {
                const nonPrivileged = data.filter(r => !PRIVILEGED_ROLE_NAMES.includes(r.name));
                defaultRole = nonPrivileged[0];
            }

            // Only set if we found a safe role - never fallback to privileged
            if (defaultRole) {
                setFormData(prev => ({ ...prev, role_id: defaultRole!.id }));
            }
            // If no safe role found, role_id stays 0 and form validation will catch it
        } catch (err) {
            console.error('Failed to fetch roles:', err);
        }
    }, []);

    const fetchDepartments = useCallback(async () => {
        try {
            const data = await departmentApi.getDepartments();
            setDepartments(data);
        } catch (err) {
            console.error('Failed to fetch departments:', err);
        }
    }, []);

    useEffect(() => {
        if (canManageUsers && authConfig?.auth_mode === 'password') {
            void fetchDepartments();
            void fetchRoles();
        }
    }, [authConfig, canManageUsers, fetchDepartments, fetchRoles]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorKey(null);

        try {
            await userApi.createUser(formData);
            void navigate('/users');
        } catch (err: unknown) {
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setIsLoading(false);
        }
    };

    const handleDirectoryImported = (result: DirectoryImportResponse) => {
        void navigate('/users', {
            state: {
                importedUserId: result.user_id,
                importedUserName: result.name,
            },
        });
    };

    const isDirectoryFirstMode = authConfig?.auth_mode
        ? authConfig.auth_mode !== 'password'
        : false;
    const showDirectorySetupHint = Boolean(authConfig?.sso_error) || isDirectoryProviderUnavailable;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <button
                    onClick={() => {
                        void navigate('/users');
                    }}
                    className="group flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                    {t('user_new.back_to_users', { ns: 'admin' })}
                </button>
            </div>

            <div className="flex items-center gap-4 mb-2">
                <div className="bg-accent/20 p-3 rounded-2xl">
                    <UserPlus className="h-6 w-6 text-accent" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('user_new.title', { ns: 'admin' })}</h1>
                    <p className="text-slate-400">{t('user_new.subtitle', { ns: 'admin' })}</p>
                </div>
            </div>

            {errorKey && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-center gap-3">
                    <Shield className="h-5 w-5 shrink-0" />
                    <p>{t(errorKey, { ns: 'errorKeys' })}</p>
                </div>
            )}

            {isAuthConfigLoading ? (
                <div className="glass-card p-6 text-slate-300">
                    {t('user_new.loading_auth_mode', {
                        ns: 'admin',
                        defaultValue: 'Loading authentication mode...',
                    })}
                </div>
            ) : authConfigError ? (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-center gap-3">
                    <Shield className="h-5 w-5 shrink-0" />
                    <p>
                        {t('user_new.auth_mode_load_failed', {
                            ns: 'admin',
                            defaultValue: 'Unable to load authentication mode. Please refresh and try again.',
                        })}
                    </p>
                </div>
            ) : isDirectoryFirstMode ? (
                <div className="glass-card p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-accent" />
                        {t('users.add_from_ad', { ns: 'admin', defaultValue: 'Add from AD' })}
                    </h2>
                    <p className="text-sm text-slate-400">
                        {t('user_new.sso_import_help', {
                            ns: 'admin',
                            defaultValue:
                                'Import a user from directory, then configure role, department, and active status before first login.',
                        })}
                    </p>
                    {showDirectorySetupHint && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            <p className="font-medium">
                                {t('user_new.directory_setup_hint_title', {
                                    ns: 'admin',
                                    defaultValue: 'Directory provider setup required',
                                })}
                            </p>
                            <p className="mt-1 text-amber-100/90">
                                {t('user_new.directory_setup_hint_body', {
                                    ns: 'admin',
                                    defaultValue:
                                        'Configure Entra credentials (ENTRA_TENANT_ID, ENTRA_CLIENT_ID, plus client secret or certificate credential) or AD emulator (AD_EMULATOR_BASE_URL), then reload.',
                                })}
                            </p>
                            {authConfig?.sso_error && (
                                <p className="mt-2 text-xs text-amber-100/80">{authConfig.sso_error}</p>
                            )}
                        </div>
                    )}
                    <DirectoryUserImportPanel
                        onImported={handleDirectoryImported}
                        onProviderUnavailableChange={setIsDirectoryProviderUnavailable}
                    />
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
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
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
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
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
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
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
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
                                        onValueChange={(v) => setFormData({ ...formData, role_id: Number(v) })}
                                        className="w-full pl-10"
                                        options={roles.map(role => ({ value: role.id.toString(), label: role.display_name }))}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">{t('common:labels.department')}</label>
                                <div className="relative">
                                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 pointer-events-none z-10" />
                                    <ThemedSelect
                                        value={formData.department_id?.toString() ?? ''}
                                        onValueChange={(v) => setFormData({ ...formData, department_id: v ? Number(v) : null })}
                                        placeholder={t('form.placeholders.no_department_scoping')}
                                        allowEmpty
                                        emptyLabel={t('form.placeholders.no_department_scoping')}
                                        className="w-full pl-10"
                                        options={departments.map(dept => ({ value: dept.id.toString(), label: dept.name }))}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 pt-4">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    className="w-5 h-5 rounded border-white/10 bg-white/5 text-accent focus:ring-accent/50 focus:ring-offset-0"
                                    checked={formData.is_active}
                                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
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
                            onClick={() => navigate('/users')}
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
            )}
        </div>
    );
}
