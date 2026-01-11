import { User, Mail, Building, Shield, Key } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

// Get human-readable permission name
function getPermissionLabel(permission: string, permissionLabels: Record<string, string>): string {
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

// Expand *:* wildcard into role-specific meaningful permissions
function expandWildcardPermissions(permissions: string[], role: string): string[] {
    // If user doesn't have *:*, return as-is
    if (!permissions.includes('*:*')) {
        return permissions;
    }

    // Remove the wildcard
    const filtered = permissions.filter(p => p !== '*:*');

    // Admin role = system administration only (not business/GRC)
    // Per BUSINESS_LOGIC.md: admin has users:*, activity_log:read, departments:read
    if (role === 'admin') {
        return [
            ...filtered,
            'users:read',
            'users:write',
            'departments:read',
            'activity_log:read',
            'admin:config',
            'admin:logs',
            'admin:sessions',
        ];
    }

    // CRO and risk-related roles = full GRC permissions
    if (['cro', 'ceo', 'cfo', 'coo', 'risk_manager', 'compliance', 'legal', 'internal_audit', 'actuarial'].includes(role)) {
        return [
            ...filtered,
            'risks:read',
            'risks:write',
            'risks:delete',
            'controls:read',
            'controls:write',
            'controls:delete',
            'controls:execute',
            'kris:read',
            'kris:write',
            'kris:delete',
            'kri:submit',
            'approvals:read',
            'approvals:approve',
            'departments:read',
            'reports:read',
            'reports:export',
        ];
    }

    // Fallback: show the wildcard as-is
    return permissions;
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
    const { t } = useTranslation('settings');

    // Permission labels with translations
    const permissionLabels: Record<string, string> = {
        'risks:read': t('permissions.risks_read', 'View Risks'),
        'risks:write': t('permissions.risks_write', 'Create & Edit Risks'),
        'risks:delete': t('permissions.risks_delete', 'Delete Risks'),
        'controls:read': t('permissions.controls_read', 'View Controls'),
        'controls:write': t('permissions.controls_write', 'Create & Edit Controls'),
        'controls:delete': t('permissions.controls_delete', 'Delete Controls'),
        'controls:execute': t('permissions.controls_execute', 'Log Control Executions'),
        'kris:read': t('permissions.kris_read', 'View KRIs'),
        'kris:write': t('permissions.kris_write', 'Create & Edit KRIs'),
        'kris:delete': t('permissions.kris_delete', 'Delete KRIs'),
        'kri:submit': t('permissions.kri_submit', 'Submit KRI Values'),
        'approvals:read': t('permissions.approvals_read', 'View Approvals'),
        'approvals:approve': t('permissions.approvals_approve', 'Approve/Reject Requests'),
        'users:read': t('permissions.users_read', 'View Users'),
        'users:write': t('permissions.users_write', 'Manage Users'),
        'activity_log:read': t('permissions.activity_log_read', 'View Activity Log'),
        'departments:read': t('permissions.departments_read', 'View Departments'),
        'departments:write': t('permissions.departments_write', 'Manage Departments'),
        'reports:read': t('permissions.reports_read', 'View Reports'),
        'reports:export': t('permissions.reports_export', 'Export Reports'),
        'admin:config': t('permissions.admin_config', 'System Configuration'),
        'admin:logs': t('permissions.admin_logs', 'View System Logs'),
        'admin:sessions': t('permissions.admin_sessions', 'Manage Active Sessions'),
        'admin:*': t('permissions.admin_all', 'Full Admin Access'),
        '*:*': t('permissions.super_admin', 'Super Admin (All Permissions)'),
    };

    const rawPermissions = user.effective_permissions || user.permissions || [];
    const expandedPermissions = expandWildcardPermissions(rawPermissions, user.role);
    const groupedPermissions = groupPermissions(expandedPermissions);

    return (
        <div className="space-y-8">
            {/* User Identity Section */}
            <section>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <User className="h-5 w-5 text-accent" />
                    {t('profile.your_identity', 'Your Identity')}
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
                                {t('profile.email', 'Email Address')}
                            </label>
                            <p className="text-white font-medium">{user.email}</p>
                        </div>

                        {/* Department */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Building className="h-3 w-3" />
                                {t('profile.department', 'Department')}
                            </label>
                            <p className="text-white font-medium">{user.department_name || 'Not Assigned'}</p>
                        </div>

                        {/* Role */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Shield className="h-3 w-3" />
                                {t('profile.role', 'Role')}
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
                                {t('profile.access_scope', 'Access Scope')}
                            </label>
                            <p className="text-white font-medium">{user.scope_label}</p>
                        </div>
                    </div>
                </div>

                {/* AD Notice */}
                <p className="text-xs text-slate-500 mt-3 italic">
                    {t('profile.ad_notice', 'Your profile is managed by your organization\'s Active Directory. Contact your IT administrator to update your information.')}
                </p>
            </section>

            {/* Permissions Section */}
            <section>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Key className="h-5 w-5 text-accent" />
                    {t('profile.your_permissions', 'Your Permissions')}
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
                                                {getPermissionLabel(perm, permissionLabels)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
