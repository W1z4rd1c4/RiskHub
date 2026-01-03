import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Users,
    UserPlus,
    Search,
    Filter,
    Edit2,
    UserX,
    UserCheck,
    Mail,
    Shield,
    Building2,
    RefreshCw,
    Server
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../services/api';
import { UserForm } from '../components/UserForm';
import type { DirectoryUser, DirectoryUserCreate, DirectoryUserUpdate } from '../types/directory';

export function DirectoryUsersPage() {
    const [users, setUsers] = useState<DirectoryUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');

    // Form modal
    const [showForm, setShowForm] = useState(false);
    const [editingUser, setEditingUser] = useState<DirectoryUser | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const fetchUsers = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await api.listUsers();
            setUsers(data);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleRefresh = () => {
        setIsRefreshing(true);
        fetchUsers();
    };

    const toggleUserStatus = async (user: DirectoryUser) => {
        try {
            if (user.account_enabled) {
                await api.deactivateUser(user.id);
            } else {
                await api.activateUser(user.id);
            }
            fetchUsers();
        } catch (error) {
            console.error('Failed to update user status:', error);
        }
    };

    const filteredUsers = useMemo(() => {
        const search = searchTerm.toLowerCase();
        return users.filter(user => {
            const matchesSearch = user.display_name.toLowerCase().includes(search) ||
                (user.email || '').toLowerCase().includes(search);
            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' && user.account_enabled) ||
                (statusFilter === 'disabled' && !user.account_enabled);
            return matchesSearch && matchesStatus;
        });
    }, [users, searchTerm, statusFilter]);

    const openCreateForm = () => {
        setEditingUser(null);
        setShowForm(true);
    };

    const openEditForm = (user: DirectoryUser) => {
        setEditingUser(user);
        setShowForm(true);
    };

    const handleSave = async (data: DirectoryUserCreate | DirectoryUserUpdate, isEdit: boolean) => {
        setIsSaving(true);
        try {
            if (isEdit && editingUser) {
                await api.updateUser(editingUser.id, data as DirectoryUserUpdate);
            } else {
                await api.createUser(data as DirectoryUserCreate);
            }
            setShowForm(false);
            setEditingUser(null);
            fetchUsers();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                        <Server className="h-8 w-8 text-accent" />
                        Directory Management
                    </h1>
                    <p className="text-slate-400 mt-1">Manage virtual identities and cross-domain synchronization.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="bg-white/5 hover:bg-white/10 text-white p-2 rounded-xl border border-white/10 transition-all active:scale-95"
                    >
                        <RefreshCw className={cn("h-5 w-5", isRefreshing && "animate-spin")} />
                    </button>
                    <button
                        onClick={openCreateForm}
                        className="bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-accent/20 transition-all active:scale-95"
                    >
                        <UserPlus className="h-5 w-5" />
                        Add User
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-4 flex items-center gap-4">
                    <div className="bg-purple-500/20 p-3 rounded-xl">
                        <Users className="h-6 w-6 text-purple-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Total Users</p>
                        <p className="text-2xl font-bold text-white">{users.length}</p>
                    </div>
                </div>
                <div className="glass-card p-4 flex items-center gap-4">
                    <div className="bg-emerald-500/20 p-3 rounded-xl">
                        <UserCheck className="h-6 w-6 text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Active</p>
                        <p className="text-2xl font-bold text-white">{users.filter(u => u.account_enabled).length}</p>
                    </div>
                </div>
                <div className="glass-card p-4 flex items-center gap-4">
                    <div className="bg-rose-500/20 p-3 rounded-xl">
                        <UserX className="h-6 w-6 text-rose-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Deactivated</p>
                        <p className="text-2xl font-bold text-white">{users.filter(u => !u.account_enabled).length}</p>
                    </div>
                </div>
            </div>

            <div className="glass-card p-6">
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search by name or email..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-4">
                        <div className="relative">
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <select
                                className="bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-8 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                            >
                                <option value="all">All Status</option>
                                <option value="active">Active</option>
                                <option value="disabled">Disabled</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="py-4 px-4 text-sm font-semibold text-slate-300">User</th>
                                <th className="py-4 px-4 text-sm font-semibold text-slate-300">Role & Department</th>
                                <th className="py-4 px-4 text-sm font-semibold text-slate-300">Status</th>
                                <th className="py-4 px-4 text-sm font-semibold text-slate-300 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={4} className="py-8 px-4 h-16 bg-white/5 rounded-lg mb-2" />
                                    </tr>
                                ))
                            ) : filteredUsers.length > 0 ? (
                                filteredUsers.map((user) => (
                                    <tr key={user.id} className="group hover:bg-white/5 transition-colors">
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
                                                    {user.display_name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-white group-hover:text-accent transition-colors">{user.display_name}</p>
                                                    <p className="text-xs text-slate-500 flex items-center gap-1">
                                                        <Mail className="h-3 w-3" />
                                                        {user.email}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="space-y-1">
                                                <p className="text-sm text-white flex items-center gap-1.5">
                                                    <Shield className="h-3.5 w-3.5 text-purple-400" />
                                                    {user.job_title || 'No Job Title'}
                                                </p>
                                                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                                    <Building2 className="h-3.5 w-3.5 text-slate-500" />
                                                    {user.department || 'Top Level'}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className={cn(
                                                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                                user.account_enabled
                                                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                                    : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                            )}>
                                                {user.account_enabled ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => openEditForm(user)}
                                                    className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                                    title="Edit User"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => toggleUserStatus(user)}
                                                    className={cn(
                                                        "p-2 rounded-lg transition-all",
                                                        user.account_enabled
                                                            ? "text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                                                            : "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                                                    )}
                                                    title={user.account_enabled ? "Deactivate" : "Activate"}
                                                >
                                                    {user.account_enabled ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="py-12 text-center text-slate-500">
                                        No users found matching your criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Overlay */}
            {showForm && (
                <UserForm
                    user={editingUser}
                    onSave={handleSave}
                    onCancel={() => {
                        setShowForm(false);
                        setEditingUser(null);
                    }}
                    isLoading={isSaving}
                />
            )}
        </div>
    );
}
