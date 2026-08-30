/**
 * PermissionMatrix component for displaying and editing user's effective permissions.
 * Compact hybrid layout for better readability and pro feel.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Check, Info } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { getPermissionLabel } from './permissionPresentation';

interface PermissionMatrixProps {
    permissions: string[];
    className?: string;
    editable?: boolean;
    onPermissionsChange?: (permissions: string[]) => void;
}

// Action styling configuration
const actionStyles: Record<string, { color: string; bg: string; border: string }> = {
    read: { color: 'text-accent-text', bg: 'bg-info/10', border: 'border-info/20' },
    write: { color: 'text-success-text', bg: 'bg-success/10', border: 'border-success/20' },
    delete: { color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20' },
};

// Resource configuration
const resourceConfig: Record<string, { icon: string; labelKey: string; descriptionKey: string }> = {
    users: { icon: '👥', labelKey: 'admin:access.matrix.resources.users.label', descriptionKey: 'admin:access.matrix.resources.users.description' },
    risks: { icon: '⚠️', labelKey: 'admin:access.matrix.resources.risks.label', descriptionKey: 'admin:access.matrix.resources.risks.description' },
    controls: { icon: '🛡️', labelKey: 'admin:access.matrix.resources.controls.label', descriptionKey: 'admin:access.matrix.resources.controls.description' },
    approvals: { icon: '✅', labelKey: 'admin:access.matrix.resources.approvals.label', descriptionKey: 'admin:access.matrix.resources.approvals.description' },
    reports: { icon: '📊', labelKey: 'admin:access.matrix.resources.reports.label', descriptionKey: 'admin:access.matrix.resources.reports.description' },
    dashboard: { icon: '📈', labelKey: 'admin:access.matrix.resources.dashboard.label', descriptionKey: 'admin:access.matrix.resources.dashboard.description' },
    notifications: { icon: '🔔', labelKey: 'admin:access.matrix.resources.notifications.label', descriptionKey: 'admin:access.matrix.resources.notifications.description' },
    departments: { icon: '🏢', labelKey: 'admin:access.matrix.resources.departments.label', descriptionKey: 'admin:access.matrix.resources.departments.description' },
};

const allResourceActions: Record<string, string[]> = {
    users: ['read', 'write', 'delete'],
    risks: ['read', 'write', 'delete'],
    controls: ['read', 'write', 'delete'],
    approvals: ['read', 'write'],
    reports: ['read', 'write'],
    dashboard: ['read'],
    notifications: ['read', 'write'],
    departments: ['read', 'write'],
};

export function PermissionMatrix({
    permissions,
    className,
    editable = false,
    onPermissionsChange
}: PermissionMatrixProps) {
    const { t } = useTranslation(['admin', 'common', 'settings']);
    const [localPermissions, setLocalPermissions] = useState<Set<string>>(new Set(permissions));

    // Group permissions by resource
    const grouped = permissions.reduce((acc, permission) => {
        const parts = permission.split(':');
        const parsedResource = parts.length === 2 && parts[0] && parts[1] ? parts[0] : null;
        const resource = parsedResource && resourceConfig[parsedResource]
            ? parsedResource
            : '__additional__';
        if (!acc[resource]) acc[resource] = [];
        acc[resource].push(permission);
        return acc;
    }, {} as Record<string, string[]>);

    const sortedResources = Object.keys(editable ? allResourceActions : grouped).sort((a, b) => {
        const order = ['users', 'risks', 'controls', 'approvals', 'reports', 'dashboard', 'departments'];
        const aIdx = order.indexOf(a);
        const bIdx = order.indexOf(b);
        if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
    });

    const togglePermission = (resource: string, action: string) => {
        if (!editable) return;
        const perm = `${resource}:${action}`;
        const next = new Set(localPermissions);
        if (next.has(perm)) next.delete(perm);
        else next.add(perm);
        setLocalPermissions(next);
        onPermissionsChange?.(Array.from(next));
    };

    return (
        <div className={cn('grid grid-cols-1 gap-1', className)}>
            {/* Header for the "table" */}
            <div className="hidden md:grid grid-cols-[180px_1fr] px-4 py-2 border-b border-border text-xs font-black uppercase tracking-widest text-muted-foreground">
                <div>{t('access.matrix.resource', { ns: 'admin' })}</div>
                <div className="flex gap-4">{t('access.matrix.permissions_capabilities', { ns: 'admin' })}</div>
            </div>

            {sortedResources.map((resource) => {
                const config = resourceConfig[resource] || {
                    icon: '📋',
                    labelKey: 'settings:permissions.other_resource',
                    descriptionKey: 'settings:permissions.other_resource_description',
                };
                const permissionTokens = editable
                    ? (allResourceActions[resource] || []).map((action) => `${resource}:${action}`)
                    : grouped[resource];

                return (
                    <div key={resource} className="grid md:grid-cols-[180px_1fr] items-center group hover:bg-white/[0.02] rounded-lg transition-colors py-1">
                        {/* Resource Identity */}
                        <div className="px-4 py-2 flex items-center gap-2.5">
                            <span className="text-base grayscale group-hover:grayscale-0 transition-[filter]">{config.icon}</span>
                            <div>
                                <p className="text-xs font-bold text-foreground leading-none">{t(config.labelKey)}</p>
                                <p className="text-xs text-muted-foreground mt-1 leading-none">{t(config.descriptionKey)}</p>
                            </div>
                        </div>

                        {/* Actions Row */}
                        <div className="px-4 py-1 flex flex-wrap gap-2">
                            {[...permissionTokens].sort().map((perm) => {
                                const action = perm.split(':')[1] ?? '';
                                const enabled = localPermissions.has(perm);
                                const style = actionStyles[action] || { color: 'text-muted-foreground', bg: 'bg-nested', border: 'border-border' };
                                const label = getPermissionLabel(perm, t);

                                return (
                                    <button
                                        key={perm}
                                        data-testid="permission-matrix-action"
                                        type="button"
                                        disabled={!editable}
                                        onClick={() => togglePermission(resource, action)}
                                        aria-label={label}
                                        className={cn(
                                            "flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-bold uppercase tracking-wider transition-[background-color,border-color,color,filter,transform]",
                                            enabled
                                                ? `${style.bg} ${style.border} ${style.color}`
                                                : "bg-transparent border-transparent text-muted-foreground hover:text-foreground grayscale",
                                            editable && "cursor-pointer active:scale-95"
                                        )}
                                        title={label}
                                    >
                                        <div className={cn(
                                            "w-3.5 h-3.5 rounded-sm flex items-center justify-center border",
                                            enabled ? `border-current` : "border-slate-800"
                                        )}>
                                            {enabled && <Check className="h-2.5 w-2.5" />}
                                        </div>
                                        <span className="normal-case tracking-normal">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {editable && (
                <div className="mt-2 px-4 py-2 flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest border-t border-border">
                    <Info className="h-3.5 w-3.5 text-accent" />
                    {t('access.matrix.click_to_toggle', { ns: 'admin' })}
                </div>
            )}
            {permissions.length > 0 && (
                <details className="mt-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">
                        {t('permissions.technical_details', { ns: 'settings' })}
                    </summary>
                    <ul className="mt-2 space-y-1">
                        {permissions.map((permission) => (
                            <li key={permission}><code>{permission}</code></li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}

export function PermissionChips({ permissions, maxVisible = 5, className }: { permissions: string[], maxVisible?: number, className?: string }) {
    const { t } = useTranslation('settings');
    const actionColors: Record<string, string> = {
        read: 'bg-info/10 text-accent-text border-info/20',
        write: 'bg-success/10 text-success-text border-success/20',
        delete: 'bg-destructive/10 text-destructive border-destructive/20',
    };

    const visible = permissions.slice(0, maxVisible);
    const remaining = permissions.length - maxVisible;

    return (
        <div className={cn('flex flex-wrap gap-1', className)}>
            {visible.map((perm) => {
                const action = perm.split(':')[1] ?? '';
                const label = getPermissionLabel(perm, t);
                return (
                    <span
                        key={perm}
                        data-testid="permission-summary-badge"
                        className={cn(
                            'px-1.5 py-0.5 text-[10px] font-medium rounded border',
                            actionColors[action] || 'bg-muted text-muted-foreground border-border'
                        )}
                        title={label}
                    >
                        {label}
                    </span>
                );
            })}
            {remaining > 0 && (
                <span data-testid="permission-summary-badge" className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground border border-border">
                    +{remaining}
                </span>
            )}
        </div>
    );
}
