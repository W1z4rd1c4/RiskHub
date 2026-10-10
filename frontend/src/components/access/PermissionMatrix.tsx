import { useState } from 'react';
import {
    AlertTriangle,
    BarChart3,
    Bell,
    Building2,
    Check,
    CheckCircle2,
    ClipboardList,
    Info,
    ShieldCheck,
    TrendingUp,
    Users,
    type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { useTranslation } from '@/i18n/hooks';
import type { Tone } from '@/lib/tones';
import { cn } from '@/lib/utils';
import { getPermissionLabel } from './permissionPresentation';

interface PermissionMatrixProps {
    permissions: string[];
    className?: string;
    editable?: boolean;
    onPermissionsChange?: (permissions: string[]) => void;
}

// Action tone configuration (colour meaning comes from lib/tones.ts)
const actionTones: Record<string, Tone> = {
    read: 'info',
    write: 'success',
    delete: 'danger',
};

// Resource configuration
const resourceConfig: Record<string, { icon: LucideIcon; labelKey: string; descriptionKey: string }> = {
    users: { icon: Users, labelKey: 'admin:access.matrix.resources.users.label', descriptionKey: 'admin:access.matrix.resources.users.description' },
    risks: { icon: AlertTriangle, labelKey: 'admin:access.matrix.resources.risks.label', descriptionKey: 'admin:access.matrix.resources.risks.description' },
    controls: { icon: ShieldCheck, labelKey: 'admin:access.matrix.resources.controls.label', descriptionKey: 'admin:access.matrix.resources.controls.description' },
    approvals: { icon: CheckCircle2, labelKey: 'admin:access.matrix.resources.approvals.label', descriptionKey: 'admin:access.matrix.resources.approvals.description' },
    reports: { icon: BarChart3, labelKey: 'admin:access.matrix.resources.reports.label', descriptionKey: 'admin:access.matrix.resources.reports.description' },
    dashboard: { icon: TrendingUp, labelKey: 'admin:access.matrix.resources.dashboard.label', descriptionKey: 'admin:access.matrix.resources.dashboard.description' },
    notifications: { icon: Bell, labelKey: 'admin:access.matrix.resources.notifications.label', descriptionKey: 'admin:access.matrix.resources.notifications.description' },
    departments: { icon: Building2, labelKey: 'admin:access.matrix.resources.departments.label', descriptionKey: 'admin:access.matrix.resources.departments.description' },
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
            <div className="hidden md:grid grid-cols-[180px_1fr] px-4 py-2 border-b border-border text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <div>{t('access.matrix.resource', { ns: 'admin' })}</div>
                <div className="flex gap-4">{t('access.matrix.permissions_capabilities', { ns: 'admin' })}</div>
            </div>

            {sortedResources.map((resource) => {
                const config = resourceConfig[resource] || {
                    icon: ClipboardList,
                    labelKey: 'settings:permissions.other_resource',
                    descriptionKey: 'settings:permissions.other_resource_description',
                };
                const permissionTokens = editable
                    ? (allResourceActions[resource] || []).map((action) => `${resource}:${action}`)
                    : grouped[resource];

                return (
                    <div key={resource} className="grid md:grid-cols-[180px_1fr] items-center group hover:bg-tint/[0.03] rounded-lg transition-colors py-1">
                        {/* Resource Identity */}
                        <div className="px-4 py-2 flex items-center gap-2.5">
                            <config.icon aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                            <div>
                                <p className="text-xs font-bold text-foreground leading-none">{t(config.labelKey)}</p>
                                <p className="text-xs text-muted-foreground mt-1 leading-none">{t(config.descriptionKey)}</p>
                            </div>
                        </div>

                        {/* Actions Row. Read-only: the granted permissions as a list with a text
                            state (GAP-D-16: not disabled buttons, not colour alone). Edit mode: a
                            native checkbox per permission, so the pressed state is announced. */}
                        <ul className="px-4 py-1 flex flex-wrap gap-2">
                            {[...permissionTokens].sort().map((perm) => {
                                const action = perm.split(':')[1] ?? '';
                                const enabled = localPermissions.has(perm);
                                const label = getPermissionLabel(perm, t);

                                if (editable) {
                                    return (
                                        <li key={perm}>
                                            <Field layout="inline" label={label} className="items-center gap-2 text-xs">
                                                {(field) => (
                                                    <Checkbox
                                                        {...field}
                                                        data-testid="permission-matrix-action"
                                                        checked={enabled}
                                                        onCheckedChange={() => togglePermission(resource, action)}
                                                    />
                                                )}
                                            </Field>
                                        </li>
                                    );
                                }

                                return (
                                    <li key={perm}>
                                        <Badge
                                            data-testid="permission-matrix-action"
                                            shape="rounded"
                                            tone={actionTones[action] ?? 'neutral'}
                                            className="font-medium"
                                        >
                                            <Check aria-hidden="true" className="h-3 w-3" />
                                            <span>{label}</span>
                                            <span className="sr-only">{t('access.matrix.granted', { ns: 'admin' })}</span>
                                        </Badge>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                );
            })}

            {editable && (
                <div className="mt-2 px-4 py-2 flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider border-t border-border">
                    <Info aria-hidden="true" className="h-3.5 w-3.5 text-accent-text" />
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

    const visible = permissions.slice(0, maxVisible);
    const remaining = permissions.length - maxVisible;

    return (
        <div className={cn('flex flex-wrap gap-1', className)}>
            {visible.map((perm) => {
                const action = perm.split(':')[1] ?? '';
                const label = getPermissionLabel(perm, t);
                return (
                    <Badge
                        key={perm}
                        data-testid="permission-summary-badge"
                        shape="rounded"
                        tone={actionTones[action] ?? 'neutral'}
                        className="font-medium"
                        title={label}
                    >
                        {label}
                    </Badge>
                );
            })}
            {remaining > 0 && (
                <Badge data-testid="permission-summary-badge" shape="rounded" tone="neutral" className="font-medium">
                    +{remaining}
                </Badge>
            )}
        </div>
    );
}
