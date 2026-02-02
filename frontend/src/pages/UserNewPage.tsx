import React, { useState, useEffect } from 'react';
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
import { userApi } from '@/services/userApi';
import { departmentApi } from '@/services/departmentApi';
import type { UserCreate, Role } from '@/types/user';
import { usePermissions } from '@/hooks/usePermissions';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';

export function UserNewPage() {
    const navigate = useNavigate();
    const { t } = useTranslation('admin');
    const { canManageUsers } = usePermissions();
    const [isLoading, setIsLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [departments, setDepartments] = useState<any[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [formData, setFormData] = useState<UserCreate>({
        email: '',
        name: '',
        password: '',
        role_id: 0, // Will be set to safe role once fetched
        department_id: null,
        manager_id: null,
        is_active: true
    });
    const [error, setError] = useState<string | null>(null);

    // Redirect if no permission to manage users
    useEffect(() => {
        if (!canManageUsers) {
            navigate('/users', { replace: true });
        }
    }, [canManageUsers, navigate]);

    useEffect(() => {
        if (canManageUsers) {
            fetchDepartments();
            fetchRoles();
        }
    }, [canManageUsers]);

    // Safe roles that can be selected by default (non-privileged)
    const SAFE_ROLE_NAMES = ['control_owner', 'viewer', 'department_head'];
    // Privileged roles that should never be auto-selected
    const PRIVILEGED_ROLE_NAMES = ['admin', 'cro', 'risk_manager'];

    const fetchRoles = async () => {
        try {
            const data = await userApi.listRoles();
            setRoles(data);

            // Find the safest default role (control_owner preferred, then viewer, then department_head)
            let defaultRole: Role | undefined;
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
    };

    const fetchDepartments = async () => {
        try {
            const data = await departmentApi.getDepartments();
            setDepartments(data);
        } catch (err) {
            console.error('Failed to fetch departments:', err);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            await userApi.createUser(formData);
            navigate('/users');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to create user. Please check your data.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate('/users')}
                    className="group flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                    Back to Users
                </button>
            </div>

            <div className="flex items-center gap-4 mb-2">
                <div className="bg-accent/20 p-3 rounded-2xl">
                    <UserPlus className="h-6 w-6 text-accent" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-white">Add New User</h1>
                    <p className="text-slate-400">Create a new platform user with specific role and department.</p>
                </div>
            </div>

            {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-center gap-3">
                    <Shield className="h-5 w-5 shrink-0" />
                    <p>{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="glass-card p-6 space-y-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                            <UserIcon className="h-5 w-5 text-accent" />
                            Personal Information
                        </h2>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Full Name</label>
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
                            <label className="text-sm font-medium text-slate-300">Email Address</label>
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
                            <label className="text-sm font-medium text-slate-300">Password</label>
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
                            Role & Access
                        </h2>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Platform Role</label>
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
                            <label className="text-sm font-medium text-slate-300">Department</label>
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
                                This user is active and can log in immediately
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
                        Cancel
                    </button>
                    <button
                        disabled={isLoading}
                        className="bg-accent hover:bg-accent/80 disabled:opacity-50 text-white px-8 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-accent/20 transition-all active:scale-95"
                    >
                        {isLoading ? (
                            <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : <Save className="h-5 w-5" />}
                        Create User
                    </button>
                </div>
            </form>
        </div>
    );
}
