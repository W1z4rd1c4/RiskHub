/**
 * PermissionMatrix component for displaying and editing user's effective permissions.
 * Compact hybrid layout for better readability and pro feel.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Check, Info } from 'lucide-react';

interface PermissionMatrixProps {
    permissions: string[];
    className?: string;
    editable?: boolean;
    onPermissionsChange?: (permissions: string[]) => void;
}

// Action styling configuration
const actionStyles: Record<string, { color: string; bg: string; border: string }> = {
    read: { color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
    write: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
    delete: { color: 'text-rose-400', bg: 'bg-rose-400/10', border: 'border-rose-400/20' },
};

// Resource configuration
const resourceConfig: Record<string, { icon: string; label: string; description: string }> = {
    users: { icon: '👥', label: 'Users', description: 'Platform users & access' },
    risks: { icon: '⚠️', label: 'Risks', description: 'Risk register & KRIs' },
    controls: { icon: '🛡️', label: 'Controls', description: 'Catalog & execution' },
    approvals: { icon: '✅', label: 'Approvals', description: 'Workflow requests' },
    reports: { icon: '📊', label: 'Reports', description: 'Analytics & exports' },
    dashboard: { icon: '📈', label: 'Dashboard', description: 'Metrics & KPIs' },
    notifications: { icon: '🔔', label: 'Notifications', description: 'Alerts & updates' },
    departments: { icon: '🏢', label: 'Departments', description: 'Orgs & hierarchy' },
};

// Detailed action descriptions
const actionDescriptions: Record<string, Record<string, string>> = {
    users: { read: 'View profiles', write: 'Create/Edit', delete: 'Remove' },
    risks: { read: 'View register', write: 'Create/Edit', delete: 'Archive' },
    controls: { read: 'View catalog', write: 'Log actions', delete: 'Remove' },
    approvals: { read: 'View requests', write: 'Approve/Reject' },
    reports: { read: 'View reports', write: 'Generate' },
    dashboard: { read: 'View metrics' },
    notifications: { read: 'View alerts', write: 'Settings' },
    departments: { read: 'View list', write: 'Edit structure' },
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
    const [localPermissions, setLocalPermissions] = useState<Set<string>>(new Set(permissions));

    // Group permissions by resource
    const grouped = permissions.reduce((acc, perm) => {
        const [resource, action] = perm.split(':');
        if (!acc[resource]) acc[resource] = [];
        acc[resource].push(action);
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
            <div className="hidden md:grid grid-cols-[180px_1fr] px-4 py-2 border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <div>Resource</div>
                <div className="flex gap-4">Permissions & Capabilities</div>
            </div>

            {sortedResources.map((resource) => {
                const config = resourceConfig[resource] || { icon: '📋', label: resource, description: '' };
                const actions = editable ? (allResourceActions[resource] || []) : grouped[resource];

                return (
                    <div key={resource} className="grid md:grid-cols-[180px_1fr] items-center group hover:bg-white/[0.02] rounded-lg transition-colors py-1">
                        {/* Resource Identity */}
                        <div className="px-4 py-2 flex items-center gap-2.5">
                            <span className="text-base grayscale group-hover:grayscale-0 transition-all">{config.icon}</span>
                            <div>
                                <p className="text-xs font-bold text-white leading-none">{config.label}</p>
                                <p className="text-[10px] text-slate-500 mt-1 leading-none">{config.description}</p>
                            </div>
                        </div>

                        {/* Actions Row */}
                        <div className="px-4 py-1 flex flex-wrap gap-2">
                            {actions.sort().map((action) => {
                                const perm = `${resource}:${action}`;
                                const enabled = localPermissions.has(perm);
                                const style = actionStyles[action] || { color: 'text-slate-400', bg: 'bg-white/5', border: 'border-white/10' };
                                const desc = actionDescriptions[resource]?.[action] || action;

                                return (
                                    <button
                                        key={perm}
                                        type="button"
                                        disabled={!editable}
                                        onClick={() => togglePermission(resource, action)}
                                        className={cn(
                                            "flex items-center gap-2 px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-all",
                                            enabled
                                                ? `${style.bg} ${style.border} ${style.color}`
                                                : "bg-transparent border-transparent text-slate-600 hover:text-slate-400 grayscale",
                                            editable && "cursor-pointer active:scale-95"
                                        )}
                                        title={desc}
                                    >
                                        <div className={cn(
                                            "w-3.5 h-3.5 rounded-sm flex items-center justify-center border",
                                            enabled ? `border-current` : "border-slate-800"
                                        )}>
                                            {enabled && <Check className="h-2.5 w-2.5" />}
                                        </div>
                                        <span>{action}</span>
                                        <span className="normal-case font-medium text-slate-500 ml-1 border-l border-white/10 pl-2 hidden lg:inline">
                                            {desc}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {editable && (
                <div className="mt-2 px-4 py-2 flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-t border-white/5">
                    <Info className="h-3.5 w-3.5 text-accent" />
                    Click items to toggle permissions.
                </div>
            )}
        </div>
    );
}

// ... PermissionChips remains the same as it was already compact ...
export function PermissionChips({ permissions, maxVisible = 5, className }: { permissions: string[], maxVisible?: number, className?: string }) {
    const actionColors: Record<string, string> = {
        read: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        write: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        delete: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    };

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
