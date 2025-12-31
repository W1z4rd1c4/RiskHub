import { useState, useEffect } from 'react';
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
    Crown,
    ChevronDown,
    ChevronRight
} from 'lucide-react';
import { accessApi } from '@/services/accessApi';
import { userApi } from '@/services/userApi';
import type { AccessUserRead } from '@/types/access';
import type { UserRead } from '@/types/user';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { PermissionChips, PermissionMatrix } from '@/components/access/PermissionMatrix';
import { AccessEditModal } from '@/components/access/AccessEditModal';

// Scope badge colors
const scopeColors: Record<string, string> = {
    global: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    department: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    manager: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export function UsersPage() {
    const [users, setUsers] = useState<AccessUserRead[]>([]);
    const [fallbackUsers, setFallbackUsers] = useState<UserRead[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [scopeFilter, setScopeFilter] = useState('all');
    const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AccessUserRead | null>(null);
    const [isAccessMode, setIsAccessMode] = useState(false);

    const { canManageUsers, canManageAccess } = usePermissions();
    const navigate = useNavigate();

    useEffect(() => {
        fetchUsers();
    }, [canManageAccess]);

    const fetchUsers = async () => {
        try {
            setIsLoading(true);
            if (canManageAccess) {
                // Privileged users get full access data
                const data = await accessApi.listAccessUsers();
                setUsers(data);
                setIsAccessMode(true);
            } else {
                // Non-privileged fall back to basic user list
                const data = await userApi.listUsers();
                setFallbackUsers(data);
                setIsAccessMode(false);
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
            // Fall back to basic user list if access API fails
            try {
                const data = await userApi.listUsers();
                setFallbackUsers(data);
                setIsAccessMode(false);
            } catch (fallbackError) {
                console.error('Fallback also failed:', fallbackError);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const toggleUserStatus = async (user: AccessUserRead | UserRead) => {
        if (!window.confirm(`Are you sure you want to ${user.is_active ? 'deactivate' : 'reactivate'} ${user.name}?`)) return;

        try {
            await userApi.updateUser(user.id, { is_active: !user.is_active });
            fetchUsers();
        } catch (error) {
            console.error('Failed to update user status:', error);
        }
    };

    const handleEditAccess = (user: AccessUserRead) => {
        setSelectedUser(user);
        setEditModalOpen(true);
    };

    const handleAccessSaved = () => {
        fetchUsers();
    };

    // Filter logic for access mode
    const filteredAccessUsers = users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || user.role.name === roleFilter;
        const matchesScope = scopeFilter === 'all' || user.access_scope === scopeFilter;
        return matchesSearch && matchesRole && matchesScope;
    });

    // Filter logic for fallback mode
    const filteredFallbackUsers = fallbackUsers.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || user.role.name === roleFilter;
        return matchesSearch && matchesRole;
    });

    const displayUsers = isAccessMode ? filteredAccessUsers : [];
    const displayFallbackUsers = !isAccessMode ? filteredFallbackUsers : [];

    // Stats
    const totalCount = isAccessMode ? users.length : fallbackUsers.length;
    const activeCount = isAccessMode
        ? users.filter(u => u.is_active).length
        : fallbackUsers.filter(u => u.is_active).length;
    const privilegedCount = isAccessMode
        ? users.filter(u => u.access_scope === 'global').length
        : 0;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                        <Users className="h-8 w-8 text-accent" />
                        {isAccessMode ? 'Access Management' : 'User Management'}
                    </h1>
                    <p className="text-slate-400 mt-1">
                        {isAccessMode
                            ? 'Manage user access, roles, and permissions across the platform.'
                            : 'View platform users and their roles.'}
                    </p>
                </div>
                {canManageUsers && (
                    <button
                        onClick={() => navigate('/users/new')}
                        className="bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-accent/20 transition-all active:scale-95"
                    >
                        <UserPlus className="h-5 w-5" />
                        Add User
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-4 flex items-center gap-4">
                    <div className="bg-purple-500/20 p-3 rounded-xl">
                        <Users className="h-6 w-6 text-purple-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Total Users</p>
                        <p className="text-2xl font-bold text-white">{totalCount}</p>
                    </div>
                </div>
                <div className="glass-card p-4 flex items-center gap-4">
                    <div className="bg-emerald-500/20 p-3 rounded-xl">
                        <UserCheck className="h-6 w-6 text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Active</p>
                        <p className="text-2xl font-bold text-white">{activeCount}</p>
                    </div>
                </div>
                <div className="glass-card p-4 flex items-center gap-4">
                    <div className="bg-amber-500/20 p-3 rounded-xl">
                        <Crown className="h-6 w-6 text-amber-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Privileged</p>
                        <p className="text-2xl font-bold text-white">{privilegedCount}</p>
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
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value)}
                            >
                                <option value="all">All Roles</option>
                                <option value="admin">Admins</option>
                                <option value="cro">CROs</option>
                                <option value="risk_manager">Risk Managers</option>
                                <option value="department_head">Dept Heads</option>
                                <option value="control_owner">Control Owners</option>
                            </select>
                        </div>
                        {isAccessMode && (
                            <div className="relative">
                                <Crown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <select
                                    className="bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-8 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
                                    value={scopeFilter}
                                    onChange={(e) => setScopeFilter(e.target.value)}
                                >
                                    <option value="all">All Scopes</option>
                                    <option value="global">Global</option>
                                    <option value="department">Department</option>
                                    <option value="manager">Manager</option>
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="py-4 px-4 text-sm font-semibold text-slate-300">User</th>
                                <th className="py-4 px-4 text-sm font-semibold text-slate-300">Role & Department</th>
                                {isAccessMode && (
                                    <th className="py-4 px-4 text-sm font-semibold text-slate-300">Scope</th>
                                )}
                                {isAccessMode && (
                                    <th className="py-4 px-4 text-sm font-semibold text-slate-300">Permissions</th>
                                )}
                                <th className="py-4 px-4 text-sm font-semibold text-slate-300">Status</th>
                                <th className="py-4 px-4 text-sm font-semibold text-slate-300 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={isAccessMode ? 6 : 4} className="py-8 px-4 h-16 bg-white/5 rounded-lg mb-2" />
                                    </tr>
                                ))
                            ) : isAccessMode && displayUsers.length > 0 ? (
                                displayUsers.map((user) => (
                                    <>
                                        <tr key={user.id} className="group hover:bg-white/5 transition-colors">
                                            <td className="py-4 px-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
                                                        {user.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-white group-hover:text-accent transition-colors">{user.name}</p>
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
                                                        {user.role.display_name}
                                                    </p>
                                                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                                        <Building2 className="h-3.5 w-3.5 text-slate-500" />
                                                        {user.department_name || 'No department'}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className={cn(
                                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                                    scopeColors[user.access_scope] || scopeColors.manager
                                                )}>
                                                    {user.access_scope === 'global' && <Crown className="h-3 w-3 mr-1" />}
                                                    {user.scope_label}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="flex items-center gap-2">
                                                    <PermissionChips permissions={user.effective_permissions} maxVisible={4} />
                                                    <button
                                                        onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
                                                        className="p-1 text-slate-500 hover:text-white rounded transition-colors"
                                                        title="Show all permissions"
                                                    >
                                                        {expandedUserId === user.id
                                                            ? <ChevronDown className="h-4 w-4" />
                                                            : <ChevronRight className="h-4 w-4" />
                                                        }
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className={cn(
                                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                                    user.is_active
                                                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                                        : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                                )}>
                                                    {user.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {canManageAccess && (
                                                        <button
                                                            onClick={() => handleEditAccess(user)}
                                                            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                                            title="Edit Access"
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                    {canManageUsers && (
                                                        <button
                                                            onClick={() => toggleUserStatus(user)}
                                                            className={cn(
                                                                "p-2 rounded-lg transition-all",
                                                                user.is_active
                                                                    ? "text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                                                                    : "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                                                            )}
                                                            title={user.is_active ? "Deactivate" : "Activate"}
                                                        >
                                                            {user.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {/* Expanded permissions row */}
                                        {expandedUserId === user.id && (
                                            <tr key={`${user.id}-expanded`}>
                                                <td colSpan={6} className="bg-white/5 px-8 py-4">
                                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                                        Effective Permissions
                                                    </div>
                                                    <PermissionMatrix permissions={user.effective_permissions} />
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))
                            ) : !isAccessMode && displayFallbackUsers.length > 0 ? (
                                displayFallbackUsers.map((user) => (
                                    <tr key={user.id} className="group hover:bg-white/5 transition-colors">
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-white group-hover:text-accent transition-colors">{user.name}</p>
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
                                                    {user.role.display_name}
                                                </p>
                                                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                                    <Building2 className="h-3.5 w-3.5 text-slate-500" />
                                                    {user.manager_name ? `Report to: ${user.manager_name}` : 'Top Level'}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className={cn(
                                                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                                user.is_active
                                                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                                    : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                                            )}>
                                                {user.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            <span className="text-xs text-slate-500 italic">View only</span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={isAccessMode ? 6 : 4} className="py-12 text-center text-slate-500">
                                        No users found matching your criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Access Edit Modal */}
            <AccessEditModal
                isOpen={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                user={selectedUser}
                onSaved={handleAccessSaved}
            />
        </div>
    );
}
