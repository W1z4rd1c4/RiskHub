import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, Edit, Trash2, RotateCcw, AlertCircle, Users } from 'lucide-react';
import { riskHubApi } from '@/services/riskHubApi';
import type { RoleHubCreate, RoleHubUpdate, RoleHubRead, PermissionRead } from '@/services/riskHubApi';
import { cn } from '@/lib/utils';

interface RoleModalProps {
    isOpen: boolean;
    onClose: () => void;
    role?: RoleHubRead | null;
    allPermissions: PermissionRead[];
    permissionsLoading: boolean;
    onSave: (data: RoleHubCreate | RoleHubUpdate) => Promise<void>;
}

function RoleModal({ isOpen, onClose, role, allPermissions, permissionsLoading, onSave }: RoleModalProps) {
    const [name, setName] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setName(role?.name || '');
            setDisplayName(role?.display_name || '');
            setDescription(role?.description || '');
            setError(null);

            // Compute initial selected IDs based on allPermissions and role.permissions strings
            const initialSelectedIds = role
                ? allPermissions
                    .filter(p => role.permissions.includes(`${p.resource}:${p.action}`))
                    .map(p => p.id)
                : [];
            setSelectedPermissionIds(initialSelectedIds);
        }
    }, [isOpen, role, allPermissions]);

    // Group permissions by resource
    const permissionsByResource = allPermissions.reduce((acc, perm) => {
        if (!acc[perm.resource]) acc[perm.resource] = [];
        acc[perm.resource].push(perm);
        return acc;
    }, {} as Record<string, PermissionRead[]>);

    const togglePermission = (id: number) => {
        setSelectedPermissionIds(prev =>
            prev.includes(id)
                ? prev.filter(p => p !== id)
                : [...prev, id]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaving(true);
        try {
            if (role) {
                // Update
                await onSave({
                    display_name: displayName,
                    description,
                    permission_ids: selectedPermissionIds
                });
            } else {
                // Create
                await onSave({
                    name,
                    display_name: displayName,
                    description,
                    permission_ids: selectedPermissionIds
                });
            }
            onClose();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <h2 className="text-xl font-bold text-white mb-4">
                    {role ? 'Edit Role' : 'New Role'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {!role && (
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Role Identifier</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent font-mono"
                                    placeholder="e.g., junior_analyst"
                                    required
                                />
                                <p className="text-xs text-slate-500 mt-1">Unique internal ID (lowercase, underscores)</p>
                            </div>
                        )}

                        <div className={cn(!role ? "" : "md:col-span-2")}>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Display Name</label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent"
                                placeholder="e.g., Junior Risk Analyst"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent"
                            placeholder="Role responsibilities..."
                            rows={2}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-3">Permissions</label>
                        {permissionsLoading ? (
                            <div className="text-slate-400 text-sm py-4 text-center">Loading permissions...</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                                {Object.entries(permissionsByResource).map(([resource, perms]) => (
                                    <div key={resource} className="bg-white/5 rounded-lg p-3 border border-white/10">
                                        <h4 className="text-xs font-bold text-accent uppercase mb-2 tracking-wider">{resource}</h4>
                                        <div className="space-y-2">
                                            {perms.map(perm => (
                                                <label key={perm.id} className="flex items-start gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedPermissionIds.includes(perm.id)}
                                                        onChange={() => togglePermission(perm.id)}
                                                        className="mt-0.5 rounded border-white/20 bg-white/5 text-accent focus:ring-accent"
                                                    />
                                                    <div>
                                                        <span className="block text-sm text-slate-200 group-hover:text-white transition-colors">
                                                            {perm.action}
                                                        </span>
                                                        {perm.description && (
                                                            <span className="block text-xs text-slate-500">
                                                                {perm.description}
                                                            </span>
                                                        )}
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
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
                            disabled={saving || permissionsLoading}
                            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 transition-colors"
                        >
                            {saving ? 'Saving...' : 'Save Role'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function RolesPanel() {
    const queryClient = useQueryClient();
    const [showInactive, setShowInactive] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<RoleHubRead | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<RoleHubRead | null>(null);

    const { data: roles, isLoading: rolesLoading } = useQuery({
        queryKey: ['roles', showInactive],
        queryFn: () => riskHubApi.getRoles(showInactive),
    });

    const { data: permissions, isLoading: permissionsLoading } = useQuery({
        queryKey: ['permissions'],
        queryFn: () => riskHubApi.getPermissions(),
    });

    const createMutation = useMutation({
        mutationFn: (data: RoleHubCreate) => riskHubApi.createRole(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: RoleHubUpdate }) => riskHubApi.updateRole(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => riskHubApi.deleteRole(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
    });

    const restoreMutation = useMutation({
        mutationFn: (id: number) => riskHubApi.restoreRole(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
    });

    const handleSave = async (data: RoleHubCreate | RoleHubUpdate) => {
        if (editingRole) {
            await updateMutation.mutateAsync({ id: editingRole.id, data: data as RoleHubUpdate });
        } else {
            await createMutation.mutateAsync(data as RoleHubCreate);
        }
    };

    const handleDelete = async () => {
        if (deleteConfirm) {
            try {
                await deleteMutation.mutateAsync(deleteConfirm.id);
                setDeleteConfirm(null);
            } catch (error: any) {
                alert(error.response?.data?.detail || "Failed to delete role");
            }
        }
    };

    if (rolesLoading) {
        return <div className="text-slate-400 text-center py-8">Loading roles...</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-semibold text-white">Platform Roles</h3>
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
                        onClick={() => { setEditingRole(null); setModalOpen(true); }}
                        className="flex items-center gap-2 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Add Role
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Role Name</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Permissions</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">Users</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                            <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {roles?.map((role) => (
                            <tr
                                key={role.id}
                                className={cn(
                                    "border-b border-white/5 hover:bg-white/5 transition-colors",
                                    !role.is_active && "opacity-50"
                                )}
                            >
                                <td className="py-3 px-4">
                                    <div className="font-medium text-white">{role.display_name}</div>
                                    <code className="text-xs text-slate-500 font-mono">{role.name}</code>
                                    {role.description && (
                                        <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{role.description}</div>
                                    )}
                                </td>
                                <td className="py-3 px-4">
                                    <div className="flex flex-wrap gap-1 max-w-md">
                                        {role.name === 'admin' ? (
                                            <span className="px-1.5 py-0.5 bg-blue-500/20 rounded text-xs text-blue-400 border border-blue-500/20 font-bold">
                                                Admin Permissions
                                            </span>
                                        ) : role.permissions.includes("*:*") ? (
                                            <span className="px-1.5 py-0.5 bg-accent/20 rounded text-xs text-accent border border-accent/20 font-bold">
                                                Full Access
                                            </span>
                                        ) : role.permissions.length > 0 ? (
                                            role.permissions.map(p => (
                                                <span key={p} className="px-1.5 py-0.5 bg-white/10 rounded text-xs text-slate-300 border border-white/5">
                                                    {p}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-xs text-slate-500 italic">No permissions</span>
                                        )}
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 bg-white/5 rounded-full inline-flex">
                                        <Users className="h-3 w-3 text-slate-400" />
                                        <span className="text-xs text-slate-300">{role.user_count}</span>
                                    </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                    {role.is_system ? (
                                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs border border-blue-500/20">
                                            System
                                        </span>
                                    ) : role.is_active ? (
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
                                            onClick={() => { setEditingRole(role); setModalOpen(true); }}
                                            className={cn(
                                                "p-1.5 rounded transition-colors",
                                                ['cro', 'admin', 'viewer'].includes(role.name)
                                                    ? "text-slate-600 cursor-not-allowed"
                                                    : "text-slate-400 hover:text-white hover:bg-white/10"
                                            )}
                                            disabled={['cro', 'admin', 'viewer'].includes(role.name)}
                                            title={['cro', 'admin', 'viewer'].includes(role.name) ? `${role.display_name} role cannot be edited` : "Edit"}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </button>

                                        {!role.is_system && role.is_active && !['admin', 'cro', 'viewer', 'internal_audit'].includes(role.name) && (
                                            <button
                                                onClick={() => setDeleteConfirm(role)}
                                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}

                                        {!role.is_active && (
                                            <button
                                                onClick={() => restoreMutation.mutate(role.id)}
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
            <RoleModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); setEditingRole(null); }}
                role={editingRole}
                allPermissions={permissions || []}
                permissionsLoading={permissionsLoading}
                onSave={handleSave}
            />

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-white/10 shadow-2xl rounded-2xl w-full max-w-sm p-6">
                        <h3 className="text-lg font-bold text-white mb-2">Delete Role?</h3>
                        <p className="text-slate-400 text-sm mb-4">
                            Are you sure you want to delete <strong className="text-white">{deleteConfirm.display_name}</strong>?
                            {deleteConfirm.user_count > 0 && (
                                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-400">
                                    <AlertCircle className="h-5 w-5 shrink-0" />
                                    <span>
                                        Cannot delete: <strong>{deleteConfirm.user_count} users</strong> are assigned to this role.
                                    </span>
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
                            {deleteConfirm.user_count === 0 && (
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
