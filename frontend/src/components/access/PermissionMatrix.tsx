/**
 * PermissionMatrix component for displaying user's effective permissions.
 * Grouped by resource with color-coded action badges.
 */
import { cn } from '@/lib/utils';

interface PermissionMatrixProps {
    permissions: string[];
    className?: string;
}

// Permission colors by action
const actionColors: Record<string, string> = {
    read: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    write: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    delete: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

// Resource icons and display names
const resourceConfig: Record<string, { icon: string; label: string }> = {
    users: { icon: '👥', label: 'Users' },
    risks: { icon: '⚠️', label: 'Risks' },
    controls: { icon: '🛡️', label: 'Controls' },
    approvals: { icon: '✅', label: 'Approvals' },
    reports: { icon: '📊', label: 'Reports' },
    dashboard: { icon: '📈', label: 'Dashboard' },
    notifications: { icon: '🔔', label: 'Notifications' },
};

export function PermissionMatrix({ permissions, className }: PermissionMatrixProps) {
    // Group permissions by resource
    const grouped = permissions.reduce((acc, perm) => {
        const [resource, action] = perm.split(':');
        if (!acc[resource]) {
            acc[resource] = [];
        }
        acc[resource].push(action);
        return acc;
    }, {} as Record<string, string[]>);

    // Sort resources by importance
    const sortedResources = Object.keys(grouped).sort((a, b) => {
        const order = ['users', 'risks', 'controls', 'approvals', 'reports', 'dashboard'];
        const aIdx = order.indexOf(a);
        const bIdx = order.indexOf(b);
        if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
    });

    if (permissions.length === 0) {
        return (
            <div className={cn('text-sm text-slate-500 italic', className)}>
                No permissions assigned
            </div>
        );
    }

    return (
        <div className={cn('space-y-2', className)}>
            {sortedResources.map((resource) => {
                const actions = grouped[resource];
                const config = resourceConfig[resource] || { icon: '📋', label: resource };

                return (
                    <div key={resource} className="flex items-center gap-2">
                        <span className="text-sm w-24 flex items-center gap-1.5 text-slate-400">
                            <span className="text-base">{config.icon}</span>
                            {config.label}
                        </span>
                        <div className="flex flex-wrap gap-1">
                            {actions.sort().map((action) => (
                                <span
                                    key={`${resource}:${action}`}
                                    className={cn(
                                        'px-2 py-0.5 text-xs font-medium rounded-md border',
                                        actionColors[action] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                                    )}
                                >
                                    {action}
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Compact permission chips for table display.
 */
interface PermissionChipsProps {
    permissions: string[];
    maxVisible?: number;
    className?: string;
}

export function PermissionChips({ permissions, maxVisible = 5, className }: PermissionChipsProps) {
    const visible = permissions.slice(0, maxVisible);
    const remaining = permissions.length - maxVisible;

    return (
        <div className={cn('flex flex-wrap gap-1', className)}>
            {visible.map((perm) => {
                const [resource, action] = perm.split(':');
                return (
                    <span
                        key={perm}
                        className={cn(
                            'px-1.5 py-0.5 text-[10px] font-medium rounded border',
                            actionColors[action] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                        )}
                        title={perm}
                    >
                        {resource.slice(0, 3)}:{action.charAt(0)}
                    </span>
                );
            })}
            {remaining > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-white/10 text-slate-400 border border-white/10">
                    +{remaining}
                </span>
            )}
        </div>
    );
}
