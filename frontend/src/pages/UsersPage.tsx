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
    ChevronRight,
    Key,
    Server
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
import { ConfirmDialog } from '@/components/ConfirmDialog';

// Scope badge colors
const scopeColors: Record<string, string> = {
    global: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    platform: 'bg-slate-500/20 text-slate-400 border-slate-500/30', // Admin platform scope
    department: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    manager: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

// Permission filter options
const permissionResources = [
    { value: 'all', label: 'All Permissions' },
    { value: 'risks', label: '⚠️ Risks' },
    { value: 'controls', label: '🛡️ Controls' },
    { value: 'users', label: '👥 Users' },
    { value: 'reports', label: '📊 Reports' },
    { value: 'approvals', label: '✅ Approvals' },
    { value: 'departments', label: '🏢 Departments' },
];

const permissionActions = [
    { value: 'all', label: 'Any Action' },
    { value: 'read', label: 'Can View' },
    { value: 'write', label: 'Can Edit' },
    { value: 'delete', label: 'Can Delete' },
];

export function UsersPage() {
    const [users, setUsers] = useState<AccessUserRead[]>([]);
    const [fallbackUsers, setFallbackUsers] = useState<UserRead[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [scopeFilter, setScopeFilter] = useState('all');
    const [permResourceFilter, setPermResourceFilter] = useState('all');
    const [permActionFilter, setPermActionFilter] = useState('all');
    const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AccessUserRead | null>(null);
    const [isAccessMode, setIsAccessMode] = useState(false);

    // Confirm dialog state for user status toggle
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const [userToToggle, setUserToToggle] = useState<AccessUserRead | UserRead | null>(null);
    const [isToggling, setIsToggling] = useState(false);

    const { canManageUsers, canManageAccess, user: currentUser } = usePermissions();
    const navigate = useNavigate();

    // Department heads get access view but scoped to their department
    const isDepartmentHead = currentUser?.role === 'department_head';

    useEffect(() => {
        // Wait for user to be loaded before fetching
        if (currentUser) {
            fetchUsers();
        }
    }, [canManageAccess, isDepartmentHead, currentUser]);

    const fetchUsers = async () => {
        try {
            setIsLoading(true);
            if (canManageAccess) {
                // Privileged users get full access data
                const data = await accessApi.listAccessUsers();
                setUsers(data);
                setIsAccessMode(true);
            } else if (isDepartmentHead) {
                // Department heads get their department's access data
                const data = await accessApi.listDepartmentAccessUsers();
                setUsers(data);
                setIsAccessMode(true); // Enable access mode to show permissions
            } else {
                // Non-privileged get scoped user lookup (read-only)
                const data = await userApi.listVisibleUsers();
                // Map to UserRead-like structure for display
                setFallbackUsers(data.map(u => ({
                    ...u,
                    is_active: true, // Lookup only returns active by default
                    role: { name: u.role_name || 'Unknown', display_name: u.role_name || 'Unknown' },
                    manager_name: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    access_scope: 'manager', // Placeholder
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                })) as any[]);
                setIsAccessMode(false);
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleClick = (user: AccessUserRead | UserRead) => {
        setUserToToggle(user);
        setConfirmDialogOpen(true);
    };

    const toggleUserStatus = async () => {
        if (!userToToggle) return;

        try {
            setIsToggling(true);
            await userApi.updateUser(userToToggle.id, { is_active: !userToToggle.is_active });
            fetchUsers();
        } catch (error) {
            console.error('Failed to update user status:', error);
        } finally {
            setIsToggling(false);
            setConfirmDialogOpen(false);
            setUserToToggle(null);
        }
    };

    const handleEditAccess = (user: AccessUserRead) => {
        setSelectedUser(user);
        setEditModalOpen(true);
    };

    const handleAccessSaved = () => {
        fetchUsers();
    };

    // Check if user has specific permission
    const hasPermission = (perms: string[], resource: string, action: string) => {
        if (resource === 'all' && action === 'all') return true;
        return perms.some(p => {
            const [r, a] = p.split(':');
            const matchesResource = resource === 'all' || r === resource;
            const matchesAction = action === 'all' || a === action;
            return matchesResource && matchesAction;
        });
    };

    // Filter logic for access mode
    const filteredAccessUsers = users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || user.role.name === roleFilter;
        const matchesScope = scopeFilter === 'all' || user.access_scope === scopeFilter;
        const matchesPerm = hasPermission(user.effective_permissions, permResourceFilter, permActionFilter);
        return matchesSearch && matchesRole && matchesScope && matchesPerm;
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
        ? users.filter(u => u.access_scope === 'global' && u.role.name !== 'admin').length
        : 0;

    // Clear permission filters
    const hasPermFilters = permResourceFilter !== 'all' || permActionFilter !== 'all';

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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <div className="glass-card p-4 flex items-center gap-4">
                    <div className="bg-slate-500/20 p-3 rounded-xl">
                        <Server className="h-6 w-6 text-slate-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Sys Admins</p>
                        <p className="text-2xl font-bold text-white">{isAccessMode ? users.filter(u => u.role.name === 'admin').length : 0}</p>
                    </div>
                </div>
            </div>

            <div className="glass-card p-6">
                {/* Search and Filters */}
                <div className="flex flex-col gap-4 mb-6">
                    {/* Row 1: Search + Role + Scope */}
                    <div className="flex flex-col md:flex-row gap-4">
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
                        <div className="flex gap-2 flex-wrap">
                            <div className="relative">
                                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <select
                                    className="bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-8 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all text-sm"
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
                                        className="bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-8 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all text-sm"
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

                    {/* Row 2: Permission Filters (Access Mode only) */}
                    {isAccessMode && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                <Key className="h-3.5 w-3.5" />
                                Filter by Capability:
                            </span>
                            <select
                                className={cn(
                                    "bg-white/5 border rounded-lg py-1.5 px-3 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all",
                                    permResourceFilter !== 'all' ? "border-purple-500/50 text-purple-400" : "border-white/10 text-white"
                                )}
                                value={permResourceFilter}
                                onChange={(e) => setPermResourceFilter(e.target.value)}
                            >
                                {permissionResources.map(r => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                            <select
                                className={cn(
                                    "bg-white/5 border rounded-lg py-1.5 px-3 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all",
                                    permActionFilter !== 'all' ? "border-emerald-500/50 text-emerald-400" : "border-white/10 text-white"
                                )}
                                value={permActionFilter}
                                onChange={(e) => setPermActionFilter(e.target.value)}
                            >
                                {permissionActions.map(a => (
                                    <option key={a.value} value={a.value}>{a.label}</option>
                                ))}
                            </select>
                            {hasPermFilters && (
                                <button
                                    onClick={() => { setPermResourceFilter('all'); setPermActionFilter('all'); }}
                                    className="text-xs text-slate-500 hover:text-white underline transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                            <span className="text-xs text-slate-500 ml-2">
                                {filteredAccessUsers.length} of {users.length} users
                            </span>
                        </div>
                    )}
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
                                                    user.role.name === 'admin'
                                                        ? scopeColors.platform
                                                        : (scopeColors[user.access_scope] || scopeColors.manager)
                                                )}
                                                >
                                                    {user.role.name === 'admin' ? (
                                                        <Server className="h-3 w-3 mr-1" />
                                                    ) : user.access_scope === 'global' ? (
                                                        <Crown className="h-3 w-3 mr-1" />
                                                    ) : null}
                                                    {user.role.name === 'admin' ? 'Platform' : user.scope_label}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4">
                                                {user.role.name === 'admin' ? (
                                                    /* Admin: Show platform capabilities */
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded text-xs border border-slate-500/30">users</span>
                                                        <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded text-xs border border-slate-500/30">health</span>
                                                        <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded text-xs border border-slate-500/30">logs</span>
                                                        <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded text-xs border border-slate-500/30">sessions</span>
                                                        <button
                                                            onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
                                                            className="p-1 text-slate-500 hover:text-white rounded transition-colors"
                                                            title="Show all capabilities"
                                                        >
                                                            {expandedUserId === user.id
                                                                ? <ChevronDown className="h-4 w-4" />
                                                                : <ChevronRight className="h-4 w-4" />
                                                            }
                                                        </button>
                                                    </div>
                                                ) : user.role.name === 'cro' ? (
                                                    /* CRO: Show Risk Hub capabilities */
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs border border-amber-500/30">risk-types</span>
                                                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs border border-amber-500/30">config</span>
                                                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs border border-amber-500/30">approvals</span>
                                                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs border border-purple-500/30">all-data</span>
                                                        <button
                                                            onClick={() => setExpandedUserId(expandedUserId === user.id ? null : user.id)}
                                                            className="p-1 text-slate-500 hover:text-white rounded transition-colors"
                                                            title="Show all capabilities"
                                                        >
                                                            {expandedUserId === user.id
                                                                ? <ChevronDown className="h-4 w-4" />
                                                                : <ChevronRight className="h-4 w-4" />
                                                            }
                                                        </button>
                                                    </div>
                                                ) : (
                                                    /* Regular users: Show business permissions */
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
                                                )}
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
                                                            onClick={() => handleToggleClick(user)}
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
                                        {/* Expanded permissions/capabilities row */}
                                        {expandedUserId === user.id && (
                                            <tr key={`${user.id}-expanded`}>
                                                <td colSpan={6} className="bg-white/5 px-8 py-4">
                                                    {user.role.name === 'admin' ? (
                                                        /* Admin: Show platform capabilities */
                                                        <>
                                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                                                Platform Administration Capabilities
                                                            </div>
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                <div className="bg-white/5 p-3 rounded-lg">
                                                                    <div className="text-slate-400 text-xs mb-1">User Management</div>
                                                                    <div className="text-white text-sm">Add, edit, deactivate users</div>
                                                                </div>
                                                                <div className="bg-white/5 p-3 rounded-lg">
                                                                    <div className="text-slate-400 text-xs mb-1">System Health</div>
                                                                    <div className="text-white text-sm">Monitor database, memory</div>
                                                                </div>
                                                                <div className="bg-white/5 p-3 rounded-lg">
                                                                    <div className="text-slate-400 text-xs mb-1">Technical Logs</div>
                                                                    <div className="text-white text-sm">View activity and security logs</div>
                                                                </div>
                                                                <div className="bg-white/5 p-3 rounded-lg">
                                                                    <div className="text-slate-400 text-xs mb-1">Session Management</div>
                                                                    <div className="text-white text-sm">View and revoke user sessions</div>
                                                                </div>
                                                            </div>
                                                            <div className="mt-3 text-xs text-amber-400/70">
                                                                <Server className="h-3 w-3 inline mr-1" />
                                                                Platform Admin has no access to business data (risks, controls, KRIs)
                                                            </div>
                                                        </>
                                                    ) : user.role.name === 'cro' ? (
                                                        /* CRO: Show Risk Hub capabilities */
                                                        <>
                                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                                                Risk Hub Capabilities
                                                            </div>
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                                                    <div className="text-amber-400 text-xs mb-1">Risk Types</div>
                                                                    <div className="text-white text-sm">Create, edit, delete risk categories</div>
                                                                </div>
                                                                <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                                                    <div className="text-amber-400 text-xs mb-1">Global Config</div>
                                                                    <div className="text-white text-sm">Set thresholds and system settings</div>
                                                                </div>
                                                                <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                                                    <div className="text-amber-400 text-xs mb-1">Approval Rules</div>
                                                                    <div className="text-white text-sm">Configure approval scenarios</div>
                                                                </div>
                                                                <div className="bg-purple-500/10 p-3 rounded-lg border border-purple-500/20">
                                                                    <div className="text-purple-400 text-xs mb-1">All Business Data</div>
                                                                    <div className="text-white text-sm">Full access to risks, controls, KRIs</div>
                                                                </div>
                                                            </div>
                                                            <div className="mt-3 text-xs text-amber-400/70">
                                                                <Crown className="h-3 w-3 inline mr-1" />
                                                                Chief Risk Officer has full business configuration access via Risk Hub
                                                            </div>
                                                        </>
                                                    ) : (
                                                        /* Regular users: Show business permissions matrix */
                                                        <>
                                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                                                Effective Permissions
                                                            </div>
                                                            <PermissionMatrix permissions={user.effective_permissions} />
                                                        </>
                                                    )}
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

            {/* User Status Toggle Confirmation Dialog */}
            <ConfirmDialog
                isOpen={confirmDialogOpen}
                onClose={() => { setConfirmDialogOpen(false); setUserToToggle(null); }}
                onConfirm={toggleUserStatus}
                title={userToToggle?.is_active ? 'Deactivate User' : 'Reactivate User'}
                message={`Are you sure you want to ${userToToggle?.is_active ? 'deactivate' : 'reactivate'} ${userToToggle?.name}?`}
                confirmLabel={userToToggle?.is_active ? 'Deactivate' : 'Reactivate'}
                variant={userToToggle?.is_active ? 'danger' : 'info'}
                isLoading={isToggling}
            />
        </div>
    );
}
