import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Check, X, ChevronDown } from 'lucide-react';
import { riskHubApi } from '@/services/riskHubApi';
import type { ApprovalScenario, ApprovalScenarioUpdate } from '@/services/riskHubApi';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';

// Special dynamic role entry for risk owner (not a system role in roles table)
const SPECIAL_ROLE_OPTIONS = [
    { value: 'risk_owner', label: 'Risk Owner (Dynamic)' },
];

interface RoleOption {
    value: string;
    label: string;
}

interface EditScenarioModalProps {
    isOpen: boolean;
    onClose: () => void;
    scenario: ApprovalScenario | null;
    availableRoles: RoleOption[];
    rolesLoading: boolean;
    onSave: (data: ApprovalScenarioUpdate) => Promise<void>;
}

function EditScenarioModal({ isOpen, onClose, scenario, availableRoles, rolesLoading, onSave }: EditScenarioModalProps) {
    const [requiresApproval, setRequiresApproval] = useState(scenario?.requires_approval ?? true);
    const [selectedRoles, setSelectedRoles] = useState<string[]>(scenario?.approver_roles ?? []);
    const [saving, setSaving] = useState(false);
    const [showRoleDropdown, setShowRoleDropdown] = useState(false);

    const handleToggleRole = (role: string) => {
        setSelectedRoles(prev =>
            prev.includes(role)
                ? prev.filter(r => r !== role)
                : [...prev, role]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await onSave({ requires_approval: requiresApproval, approver_roles: selectedRoles });
            onClose();
        } finally {
            setSaving(false);
        }
    };

    // Get label for a role, preserving unknown roles that may exist from old config
    const getRoleLabel = (roleValue: string): string => {
        const found = availableRoles.find(r => r.value === roleValue);
        return found?.label || roleValue;
    };

    if (!isOpen || !scenario) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-md p-6">
                <h2 className="text-xl font-bold text-white mb-4">
                    Configure: {scenario.display_name}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="flex items-center justify-between">
                        <span className="text-slate-300">Requires Approval</span>
                        <button
                            type="button"
                            onClick={() => setRequiresApproval(!requiresApproval)}
                            className={cn(
                                "w-12 h-6 rounded-full transition-colors relative",
                                requiresApproval ? "bg-accent" : "bg-slate-600"
                            )}
                        >
                            <span
                                className={cn(
                                    "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                                    requiresApproval ? "left-6" : "left-0.5"
                                )}
                            />
                        </button>
                    </div>

                    {requiresApproval && (
                        <div className="space-y-2">
                            <label className="text-white font-medium">Approver Roles</label>
                            {rolesLoading ? (
                                <div className="text-slate-400 text-sm py-2">Loading roles...</div>
                            ) : (
                                <>
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                                            className="w-full flex items-center justify-between px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-left"
                                        >
                                            <span className="text-slate-300">
                                                {selectedRoles.length === 0
                                                    ? 'Select roles...'
                                                    : `${selectedRoles.length} role(s) selected`}
                                            </span>
                                            <ChevronDown className="h-4 w-4 text-slate-400" />
                                        </button>

                                        {showRoleDropdown && (
                                            <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-white/10 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                                {availableRoles.map(role => (
                                                    <button
                                                        key={role.value}
                                                        type="button"
                                                        onClick={() => handleToggleRole(role.value)}
                                                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 text-left"
                                                    >
                                                        <span className="text-slate-300">{role.label}</span>
                                                        {selectedRoles.includes(role.value) && (
                                                            <Check className="h-4 w-4 text-accent" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {selectedRoles.map(role => (
                                            <span
                                                key={role}
                                                className="flex items-center gap-1 px-2 py-1 bg-accent/20 text-accent text-xs rounded-full"
                                            >
                                                {getRoleLabel(role)}
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleRole(role)}
                                                    className="hover:text-white"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving || rolesLoading}
                            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function ApprovalScenariosPanel() {
    const queryClient = useQueryClient();
    const [editingScenario, setEditingScenario] = useState<ApprovalScenario | null>(null);

    // Fetch approval scenarios
    const { data: scenarios, isLoading, error } = useQuery({
        queryKey: ['approvalScenarios'],
        queryFn: () => riskHubApi.getApprovalScenarios(),
    });

    // Fetch roles from Risk Hub to populate role options dynamically
    const { data: hubRoles, isLoading: rolesLoading } = useQuery({
        queryKey: ['roles', false], // false = active roles only
        queryFn: () => riskHubApi.getRoles(false),
    });

    // Build role options from Risk Hub roles + special dynamic entries
    const roleOptions = useMemo<RoleOption[]>(() => {
        const fromHub: RoleOption[] = (hubRoles || []).map(r => ({
            value: r.name,
            label: r.display_name,
        }));
        // Merge special roles (like risk_owner) and deduplicate
        const specialCodes = new Set(SPECIAL_ROLE_OPTIONS.map(r => r.value));
        const merged = [...SPECIAL_ROLE_OPTIONS, ...fromHub.filter(r => !specialCodes.has(r.value))];
        return merged;
    }, [hubRoles]);

    // Helper to get role label
    const getRoleLabel = (roleValue: string): string => {
        const found = roleOptions.find(r => r.value === roleValue);
        return found?.label.split('(')[0].trim() || roleValue;
    };

    const updateMutation = useMutation({
        mutationFn: ({ key, data }: { key: string; data: ApprovalScenarioUpdate }) =>
            riskHubApi.updateApprovalScenario(key, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approvalScenarios'] }),
    });

    const handleSave = async (data: ApprovalScenarioUpdate) => {
        if (editingScenario) {
            await updateMutation.mutateAsync({ key: editingScenario.key, data });
        }
    };

    if (isLoading) {
        return <div className="text-slate-400 text-center py-8">Loading approval scenarios...</div>;
    }

    if (error) {
        return <div className="text-red-400 text-center py-8">Failed to load approval scenarios</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold text-white">Approval Scenarios</h3>
            </div>

            <p className="text-slate-400 text-sm">
                Configure which business actions require approval before execution.
            </p>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Scenario</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Description</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Approvers</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {scenarios?.map((scenario) => (
                            <tr
                                key={scenario.key}
                                className="border-b border-white/5 hover:bg-white/5 transition-colors"
                            >
                                <td className="py-3 px-4">
                                    <span className="text-white font-medium">{scenario.display_name}</span>
                                </td>
                                <td className="py-3 px-4 text-slate-400 text-sm max-w-xs">
                                    {scenario.description}
                                </td>
                                <td className="py-3 px-4 text-center">
                                    {scenario.requires_approval ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs">
                                            <Check className="h-3 w-3" />
                                            Enabled
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded-full text-xs">
                                            <X className="h-3 w-3" />
                                            Disabled
                                        </span>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex flex-wrap gap-1">
                                        {scenario.approver_roles.map(role => (
                                            <span
                                                key={role}
                                                className="px-2 py-0.5 bg-white/10 text-slate-300 text-xs rounded-full"
                                            >
                                                {getRoleLabel(role)}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <button
                                        onClick={() => setEditingScenario(scenario)}
                                        className="px-3 py-1.5 text-sm text-accent hover:text-white hover:bg-accent/20 rounded-lg transition-colors"
                                    >
                                        Configure
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <EditScenarioModal
                isOpen={!!editingScenario}
                onClose={() => setEditingScenario(null)}
                scenario={editingScenario}
                availableRoles={roleOptions}
                rolesLoading={rolesLoading}
                onSave={handleSave}
            />
        </div>
    );
}
