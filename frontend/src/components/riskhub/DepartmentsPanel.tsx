import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building, Plus, Edit, Trash2, RotateCcw, AlertCircle, Users, Activity, Shield } from 'lucide-react';
import { riskHubApi } from '@/services/riskHubApi';
import { accessApi } from '@/services/accessApi';
import type { DepartmentHubCreate, DepartmentHubUpdate, DepartmentHubRead } from '@/services/riskHubApi';
import { cn } from '@/lib/utils';

interface DepartmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    department?: DepartmentHubRead | null;
    onSave: (data: DepartmentHubCreate | DepartmentHubUpdate) => Promise<void>;
}

function DepartmentModal({ isOpen, onClose, department, onSave }: DepartmentModalProps) {
    const [name, setName] = useState(department?.name || '');
    const [code, setCode] = useState(department?.code || '');
    const [managerId, setManagerId] = useState<number | undefined>(department?.manager_id || undefined);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch users for manager selection
    const { data: users } = useQuery({
        queryKey: ['users', 'access'],
        queryFn: () => accessApi.listAccessUsers(),
        enabled: isOpen,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaving(true);
        try {
            if (department) {
                // Update - explicitly send null if manager is cleared to remove assignment
                await onSave({
                    name,
                    code: code || undefined,
                    manager_id: managerId === undefined ? null : managerId
                });
            } else {
                // Create
                await onSave({
                    name,
                    code: code || undefined,
                    manager_id: managerId
                });
            }
            onClose();
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } }; message?: string };
            setError(error.response?.data?.detail || error.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-md p-6">
                <h2 className="text-xl font-bold text-white mb-4">
                    {department ? 'Edit Department' : 'New Department'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Department Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder="e.g., IT Security"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Code (Optional)</label>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent font-mono"
                            placeholder="e.g., IT_SEC"
                        />
                        <p className="text-xs text-slate-500 mt-1">Short identifier, uppercase</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Manager</label>
                        <select
                            value={managerId || ''}
                            onChange={(e) => setManagerId(e.target.value ? Number(e.target.value) : undefined)}
                            className="w-full px-3 py-2 bg-gray-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-accent"
                        >
                            <option value="">-- No Manager --</option>
                            {users?.map(user => (
                                <option key={user.id} value={user.id}>
                                    {user.name} ({user.email})
                                </option>
                            ))}
                        </select>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-400 text-sm">
                            <AlertCircle className="h-4 w-4" />
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
                        >
                            {saving ? 'Saving...' : 'Save Department'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function DepartmentsPanel() {
    const queryClient = useQueryClient();
    const [showInactive, setShowInactive] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingDept, setEditingDept] = useState<DepartmentHubRead | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<DepartmentHubRead | null>(null);

    const { data: departments, isLoading } = useQuery({
        queryKey: ['departments', showInactive],
        queryFn: () => riskHubApi.getDepartments(showInactive),
    });

    const createMutation = useMutation({
        mutationFn: (data: DepartmentHubCreate) => riskHubApi.createDepartment(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: DepartmentHubUpdate }) => riskHubApi.updateDepartment(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => riskHubApi.deleteDepartment(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
    });

    const restoreMutation = useMutation({
        mutationFn: (id: number) => riskHubApi.restoreDepartment(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
    });

    const handleSave = async (data: DepartmentHubCreate | DepartmentHubUpdate) => {
        if (editingDept) {
            await updateMutation.mutateAsync({ id: editingDept.id, data: data as DepartmentHubUpdate });
        } else {
            await createMutation.mutateAsync(data as DepartmentHubCreate);
        }
    };

    const handleDelete = async () => {
        if (deleteConfirm) {
            try {
                await deleteMutation.mutateAsync(deleteConfirm.id);
                setDeleteConfirm(null);
            } catch (error: any) {
                alert(error.response?.data?.detail || "Failed to delete department");
            }
        }
    };

    if (isLoading) {
        return <div className="text-slate-400 text-center py-8">Loading departments...</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Building className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-semibold text-white">Departments</h3>
                </div>

                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-400">
                        <input
                            type="checkbox"
                            checked={showInactive}
                            onChange={(e) => setShowInactive(e.target.checked)}
                            className="rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
                        />
                        Show deleted
                    </label>

                    <button
                        onClick={() => { setEditingDept(null); setModalOpen(true); }}
                        className="flex items-center gap-2 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Add Department
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Name / Code</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Manager</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">Users</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">Risks</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">Controls</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {departments?.map((dept) => (
                            <tr
                                key={dept.id}
                                className={cn(
                                    "border-b border-white/5 hover:bg-white/5 transition-colors",
                                    !dept.is_active && "opacity-50"
                                )}
                            >
                                <td className="py-3 px-4">
                                    <div className="font-medium text-white">{dept.name}</div>
                                    {dept.code && (
                                        <code className="text-xs text-slate-500 font-mono">{dept.code}</code>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    {dept.manager_name ? (
                                        <div className="text-sm text-slate-300">{dept.manager_name}</div>
                                    ) : (
                                        <span className="text-xs text-slate-500 italic">No manager</span>
                                    )}
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-full inline-flex">
                                        <Users className="h-3 w-3 text-slate-400" />
                                        <span className="text-xs text-slate-300">{dept.user_count}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-amber-500/10 rounded-full inline-flex">
                                        <Activity className="h-3 w-3 text-amber-500/50" />
                                        <span className="text-xs text-amber-500/80">{dept.risk_count}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 rounded-full inline-flex">
                                        <Shield className="h-3 w-3 text-emerald-500/50" />
                                        <span className="text-xs text-emerald-500/80">{dept.control_count}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    {dept.is_active ? (
                                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-xs border border-emerald-500/20">
                                            Active
                                        </span>
                                    ) : (
                                        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs border border-red-500/20">
                                            Deleted
                                        </span>
                                    )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => { setEditingDept(dept); setModalOpen(true); }}
                                            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                                            title="Edit"
                                        >
                                            <Edit className="h-4 w-4" />
                                        </button>

                                        {dept.is_active && (
                                            <button
                                                onClick={() => setDeleteConfirm(dept)}
                                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}

                                        {!dept.is_active && (
                                            <button
                                                onClick={() => restoreMutation.mutate(dept.id)}
                                                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                                                title="Restore"
                                            >
                                                <RotateCcw className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Create/Edit Modal */}
            <DepartmentModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); setEditingDept(null); }}
                department={editingDept}
                onSave={handleSave}
            />

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-sm p-6">
                        <h3 className="text-lg font-bold text-white mb-2">Delete Department?</h3>
                        <p className="text-slate-400 text-sm mb-4">
                            Are you sure you want to delete <strong className="text-white">{deleteConfirm.name}</strong>?
                            {(deleteConfirm.user_count > 0 || deleteConfirm.risk_count > 0 || deleteConfirm.control_count > 0) && (
                                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-1 text-red-400 text-xs">
                                    <div className="flex items-center gap-2 font-bold">
                                        <AlertCircle className="h-4 w-4" />
                                        Cannot delete because of linked items:
                                    </div>
                                    <ul className="list-disc list-inside ml-1">
                                        {deleteConfirm.user_count > 0 && <li>Users: {deleteConfirm.user_count}</li>}
                                        {deleteConfirm.risk_count > 0 && <li>Risks: {deleteConfirm.risk_count}</li>}
                                        {deleteConfirm.control_count > 0 && <li>Controls: {deleteConfirm.control_count}</li>}
                                    </ul>
                                </div>
                            )}
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            {deleteConfirm.user_count === 0 && deleteConfirm.risk_count === 0 && deleteConfirm.control_count === 0 && (
                                <button
                                    onClick={handleDelete}
                                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                                >
                                    Delete
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
