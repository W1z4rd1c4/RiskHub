import { User, Mail, Building, Shield, Key } from 'lucide-react';

interface ProfileSettingsProps {
    user: {
        id: number;
        email: string;
        name: string;
        role: string;
        role_display_name: string;
        department_name?: string;
        permissions: string[];
        effective_permissions: string[];
        access_scope: 'global' | 'department' | 'manager';
        scope_label: string;
    };
}

// Permission display names mapping
const permissionLabels: Record<string, string> = {
    'risks:read': 'View Risks',
    'risks:write': 'Create & Edit Risks',
    'risks:delete': 'Delete Risks',
    'controls:read': 'View Controls',
    'controls:write': 'Create & Edit Controls',
    'controls:delete': 'Delete Controls',
    'controls:execute': 'Log Control Executions',
    'kris:read': 'View KRIs',
    'kris:write': 'Create & Edit KRIs',
    'kris:delete': 'Delete KRIs',
    'kri:submit': 'Submit KRI Values',
    'approvals:read': 'View Approvals',
    'approvals:approve': 'Approve/Reject Requests',
    'users:read': 'View Users',
    'users:write': 'Manage Users',
    'activity_log:read': 'View Activity Log',
    'departments:read': 'View Departments',
    'departments:write': 'Manage Departments',
    'admin:*': 'Full Admin Access',
    '*:*': 'Super Admin (All Permissions)',
};

// Get human-readable permission name
function getPermissionLabel(permission: string): string {
    if (permissionLabels[permission]) {
        return permissionLabels[permission];
    }
    // Fallback: format the permission string nicely
    const [resource, action] = permission.split(':');
    return `${action.charAt(0).toUpperCase() + action.slice(1)} ${resource.charAt(0).toUpperCase() + resource.slice(1)}`;
}

// Group permissions by resource
function groupPermissions(permissions: string[]): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};
    permissions.forEach(perm => {
        const [resource] = perm.split(':');
        if (!grouped[resource]) {
            grouped[resource] = [];
        }
        grouped[resource].push(perm);
    });
    return grouped;
}

// Get icon color based on resource
function getResourceColor(resource: string): string {
    const colors: Record<string, string> = {
        risks: 'text-red-400',
        controls: 'text-blue-400',
        kris: 'text-amber-400',
        kri: 'text-amber-400',
        approvals: 'text-purple-400',
        users: 'text-emerald-400',
        departments: 'text-cyan-400',
        activity_log: 'text-slate-400',
        admin: 'text-rose-400',
        '*': 'text-yellow-400',
    };
    return colors[resource] || 'text-slate-400';
}

export function ProfileSettings({ user }: ProfileSettingsProps) {
    const groupedPermissions = groupPermissions(user.effective_permissions || user.permissions || []);

    return (
        <div className="space-y-8">
            {/* User Identity Section */}
            <section>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <User className="h-5 w-5 text-accent" />
                    Your Identity
                </h3>
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-6">
                        {/* Avatar */}
                        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h4 className="text-xl font-bold text-white">{user.name}</h4>
                            <p className="text-slate-400">{user.role_display_name}</p>
                        </div>
                    </div>

                    {/* Info Grid */}
                    <div className="grid gap-4 md:grid-cols-2">
                        {/* Email */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                Email Address
                            </label>
                            <p className="text-white font-medium">{user.email}</p>
                        </div>

                        {/* Department */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Building className="h-3 w-3" />
                                Department
                            </label>
                            <p className="text-white font-medium">{user.department_name || 'Not Assigned'}</p>
                        </div>

                        {/* Role */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Shield className="h-3 w-3" />
                                Role
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="px-3 py-1 bg-accent/20 text-accent rounded-full text-sm font-medium">
                                    {user.role_display_name}
                                </span>
                            </div>
                        </div>

                        {/* Access Scope */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Key className="h-3 w-3" />
                                Access Scope
                            </label>
                            <p className="text-white font-medium">{user.scope_label}</p>
                        </div>
                    </div>
                </div>

                {/* AD Notice */}
                <p className="text-xs text-slate-500 mt-3 italic">
                    Your profile is managed by your organization's Active Directory. Contact your IT administrator to update your information.
                </p>
            </section>

            {/* Permissions Section */}
            <section>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Key className="h-5 w-5 text-accent" />
                    Your Permissions
                </h3>
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    {Object.keys(groupedPermissions).length === 0 ? (
                        <p className="text-slate-400 text-center py-4">No permissions assigned</p>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {Object.entries(groupedPermissions).map(([resource, perms]) => (
                                <div key={resource} className="space-y-2">
                                    <h5 className={`text-sm font-semibold capitalize ${getResourceColor(resource)}`}>
                                        {resource === '*' ? 'Global' : resource.replace(/_/g, ' ')}
                                    </h5>
                                    <ul className="space-y-1">
                                        {perms.map(perm => (
                                            <li key={perm} className="text-sm text-slate-300 flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                {getPermissionLabel(perm)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <p className="text-xs text-slate-500 mt-3 italic">
                    Permissions are determined by your role and access scope. Contact your CRO to request changes.
                </p>
            </section>
        </div>
    );
}
