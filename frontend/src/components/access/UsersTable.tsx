import React from 'react';
import {
    Edit2,
    UserX,
    UserCheck,
    Mail,
    Shield,
    Building2,
    Crown,
    ChevronDown,
    ChevronRight,
    Server
} from 'lucide-react';
import type { AccessUserRead } from '@/types/access';
import type { UserRead } from '@/types/user';
import { cn } from '@/lib/utils';
import { PermissionChips, PermissionMatrix } from '@/components/access/PermissionMatrix';

// Scope badge colors
const scopeColors: Record<string, string> = {
    global: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    platform: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    department: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    manager: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

interface UsersTableProps {
    isAccessMode: boolean;
    isLoading: boolean;
    accessUsers: AccessUserRead[];
    fallbackUsers: UserRead[];
    expandedUserId: number | null;
    onToggleExpand: (userId: number) => void;
    canManageAccess: boolean;
    canManageUsers: boolean;
    onEditAccess: (user: AccessUserRead) => void;
    onToggleStatus: (user: AccessUserRead | UserRead) => void;
}

export function UsersTable({
    isAccessMode,
    isLoading,
    accessUsers,
    fallbackUsers,
    expandedUserId,
    onToggleExpand,
    canManageAccess,
    canManageUsers,
    onEditAccess,
    onToggleStatus,
}: UsersTableProps) {
    return (
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
                    ) : isAccessMode && accessUsers.length > 0 ? (
                        accessUsers.map((user) => (
                            <React.Fragment key={user.id}>
                                <tr className="group hover:bg-white/5 transition-colors">
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
                                                    onClick={() => onToggleExpand(user.id)}
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
                                                    onClick={() => onToggleExpand(user.id)}
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
                                                    onClick={() => onToggleExpand(user.id)}
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
                                                    onClick={() => onEditAccess(user)}
                                                    className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                                    title="Edit Access"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                            )}
                                            {canManageUsers && (
                                                <button
                                                    onClick={() => onToggleStatus(user)}
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
                                    <tr>
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
                            </React.Fragment>
                        ))
                    ) : !isAccessMode && fallbackUsers.length > 0 ? (
                        fallbackUsers.map((user) => (
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
    );
}
