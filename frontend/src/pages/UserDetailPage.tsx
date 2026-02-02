import React, { useState, useEffect } from 'react';
import {

    ArrowLeft,
    Save,
    Mail,

    Building2,
    Calendar,
    Clock,
    UserCircle,
    CheckCircle2,
    XCircle,
    Lock as LockIcon,
    Eye
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { userApi } from '@/services/userApi';
import { departmentApi } from '@/services/departmentApi';
import type { UserRead, UserUpdate, Role } from '@/types/user';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';

export function UserDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation('admin');
    const { canManageUsers } = usePermissions();
    const [user, setUser] = useState<UserRead | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [departments, setDepartments] = useState<any[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [editData, setEditData] = useState<UserUpdate & { name: string; email: string }>({
        name: '',
        email: '',
        role_id: 0,
        department_id: null,
        manager_id: null,
        is_active: true
    });
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (id) {
            fetchData();
        }
    }, [id]);

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [userData, deptData, rolesData] = await Promise.all([
                userApi.getUser(Number(id)),
                departmentApi.getDepartments(),
                userApi.listRoles()
            ]);
            setUser(userData);
            setDepartments(deptData);
            setRoles(rolesData);
            setEditData({
                name: userData.name,
                email: userData.email,
                role_id: userData.role.id,
                department_id: userData.department_id,
                manager_id: userData.manager_id,
                is_active: userData.is_active
            });
        } catch (err) {
            console.error('Failed to fetch user data:', err);
            setError('Could not load user profile.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        setSuccess(false);

        try {
            await userApi.updateUser(Number(id), editData);
            setSuccess(true);
            // Refresh local data
            await fetchData();
            setTimeout(() => setSuccess(false), 3000);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to update user profile.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>;

    if (!user) return <div className="text-center py-20">
        <p className="text-slate-400">User not found.</p>
        <button onClick={() => navigate('/users')} className="mt-4 text-accent hover:underline">Return to list</button>
    </div>;

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate('/users')}
                    className="group flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                    Back to Users
                </button>
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="w-24 h-24 rounded-3xl bg-accent/20 flex items-center justify-center text-4xl font-bold text-accent shadow-xl shadow-accent/10">
                        {user.name.charAt(0)}
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold text-white">{user.name}</h1>
                            <span className={cn(
                                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                user.is_active
                                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                            )}>
                                {user.is_active ? 'Active' : 'Deactivated'}
                            </span>
                        </div>
                        <p className="text-slate-400 text-lg">{user.role.display_name}</p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                            <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{user.email}</span>
                            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Joined {format(new Date(user.created_at), 'MMM d, yyyy')}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <form onSubmit={handleSubmit} className="glass-card p-6 space-y-6">
                        <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-2">
                            {canManageUsers ? (
                                <UserCircle className="h-5 w-5 text-accent" />
                            ) : (
                                <Eye className="h-5 w-5 text-slate-400" />
                            )}
                            {canManageUsers ? 'Edit Profile' : 'View Profile'}
                        </h2>

                        {!canManageUsers && (
                            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-3 rounded-xl flex items-center gap-2 text-sm mb-4">
                                <Eye className="h-4 w-4 shrink-0" />
                                <span>You have view-only access to user profiles</span>
                            </div>
                        )}

                        {error && (
                            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-center gap-3 animate-in shake duration-300">
                                <XCircle className="h-5 w-5 shrink-0" />
                                <p>{error}</p>
                            </div>
                        )}

                        {success && (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl flex items-center gap-3 animate-in fade-in duration-300">
                                <CheckCircle2 className="h-5 w-5 shrink-0" />
                                <p>Profile updated successfully!</p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Full Name</label>
                                <input
                                    required
                                    type="text"
                                    disabled={!canManageUsers}
                                    className={cn(
                                        "w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-white focus:outline-none focus:ring-2 focus:ring-accent/50",
                                        !canManageUsers && "opacity-60 cursor-not-allowed"
                                    )}
                                    value={editData.name}
                                    onChange={e => setEditData({ ...editData, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Email Address</label>
                                <input
                                    required
                                    type="email"
                                    disabled={!canManageUsers}
                                    className={cn(
                                        "w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-white focus:outline-none focus:ring-2 focus:ring-accent/50",
                                        !canManageUsers && "opacity-60 cursor-not-allowed"
                                    )}
                                    value={editData.email}
                                    onChange={e => setEditData({ ...editData, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Role</label>
                                <ThemedSelect
                                    value={(editData.role_id ?? 0).toString()}
                                    onValueChange={(v) => setEditData({ ...editData, role_id: Number(v) })}
                                    disabled={!canManageUsers}
                                    className={cn(
                                        "w-full",
                                        !canManageUsers && "opacity-60"
                                    )}
                                    options={roles.map(role => ({ value: role.id.toString(), label: role.display_name }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Department</label>
                                <ThemedSelect
                                    value={editData.department_id?.toString() ?? ''}
                                    onValueChange={(v) => setEditData({ ...editData, department_id: v ? Number(v) : null })}
                                    placeholder={t('form.placeholders.no_department_scoping')}
                                    allowEmpty
                                    emptyLabel={t('form.placeholders.no_department_scoping')}
                                    disabled={!canManageUsers}
                                    className={cn(
                                        "w-full",
                                        !canManageUsers && "opacity-60"
                                    )}
                                    options={departments.map(dept => ({ value: dept.id.toString(), label: dept.name }))}
                                />
                            </div>
                        </div>

                        {canManageUsers && (
                            <div className="pt-4 border-t border-white/5 flex justify-end">
                                <button
                                    disabled={isSaving}
                                    className="bg-accent hover:bg-accent/80 disabled:opacity-50 text-white px-8 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-accent/20 transition-all active:scale-95"
                                >
                                    {isSaving ? (
                                        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : <Save className="h-5 w-5" />}
                                    Save Changes
                                </button>
                            </div>
                        )}
                    </form>

                    {canManageUsers && (
                        <div className="glass-card p-6">
                            <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
                                <LockIcon className="h-5 w-5 text-accent" />
                                Security
                            </h2>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border border-white/5 rounded-2xl bg-white/5">
                                <div>
                                    <p className="text-white font-medium">Deactivate account</p>
                                    <p className="text-sm text-slate-500">Temporarily block this user from accessing the platform.</p>
                                </div>
                                <button
                                    onClick={() => setEditData({ ...editData, is_active: !editData.is_active })}
                                    className={cn(
                                        "px-4 py-2 rounded-xl text-sm font-semibold transition-all",
                                        editData.is_active
                                            ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                                            : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                    )}
                                >
                                    {editData.is_active ? 'Deactivate Account' : 'Reactivate Account'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="glass-card p-6">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-accent" />
                            Organization
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Reports To</p>
                                <div className="flex items-center gap-2 text-white">
                                    <UserCircle className="h-4 w-4 text-slate-400" />
                                    {user.manager_name || 'No Direct Manager'}
                                </div>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Last Update</p>
                                <div className="flex items-center gap-2 text-slate-300 text-sm">
                                    <Clock className="h-4 w-4" />
                                    {format(new Date(user.updated_at), 'MMM d, HH:mm')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card p-6 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border-accent/10">
                        <h3 className="text-lg font-semibold text-white mb-2">Platform Permissions</h3>
                        <p className="text-sm text-slate-400 mb-4">Permissions are inherited from the user's role.</p>
                        <div className="space-y-2">
                            {user.role.name === 'admin' || user.role.name === 'cro' ? (
                                <div className="p-3 rounded-xl bg-accent/10 border border-accent/10 text-accent font-medium text-sm text-center">
                                    Full System Access Granted
                                </div>
                            ) : (
                                <div className="text-sm text-slate-500 italic">
                                    Scoped permissions apply based on department assignment.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
