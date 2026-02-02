/**
 * AccessEditModal component for editing user access settings.
 * Privileged users can edit role, department, manager.
 * Admin/CRO can additionally edit access_scope.
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Shield, Building2, User, Loader2, Check, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/i18n/hooks';
import { accessApi } from '@/services/accessApi';
import { departmentApi } from '@/services/departmentApi';
import { userApi } from '@/services/userApi';
import { usePermissions } from '@/hooks/usePermissions';
import type { AccessUserRead, AccessUserUpdate, RoleWithPermissions, AccessScopeEnum } from '@/types/access';
import type { DepartmentSummary } from '@/services/departmentApi';
import type { UserRead } from '@/types/user';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

interface AccessEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AccessUserRead | null;
    onSaved: () => void;
}

const SCOPE_OPTIONS: { value: AccessScopeEnum; label: string; description: string }[] = [
    { value: 'global', label: 'Global', description: 'Full system access' },
    { value: 'department', label: 'Department', description: "Access within user's department" },
    { value: 'manager', label: 'Manager', description: 'Access to direct reports only' },
];

export function AccessEditModal({ isOpen, onClose, user, onSaved }: AccessEditModalProps) {
    const { canManagePrivileged } = usePermissions();
    const { t } = useTranslation('common');

    const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
    const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
    const [allUsers, setAllUsers] = useState<UserRead[]>([]);

    const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
    const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
    const [selectedManagerId, setSelectedManagerId] = useState<number | null>(null);
    const [selectedScope, setSelectedScope] = useState<AccessScopeEnum>('manager');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        if (isOpen && user) {
            setIsInitialized(false);
            setError(null);
            setSelectedRoleId(user.role_id);
            setSelectedDeptId(user.department_id);
            setSelectedManagerId(user.manager_id);
            setSelectedScope(user.access_scope);
            loadData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- loadData is stable, user?.id is the key dependency
    }, [isOpen, user?.id]);

    const loadData = async () => {
        try {
            const [rolesData, deptsData, usersData] = await Promise.all([
                accessApi.listAccessRoles(),
                departmentApi.getDepartments(),
                userApi.listUsers(0, 100),
            ]);
            setRoles(rolesData);
            setDepartments(deptsData);
            setAllUsers(usersData.filter((u: UserRead) => u.is_active && u.id !== user?.id));
            setTimeout(() => setIsInitialized(true), 100);
        } catch (err) {
            console.error('Failed to load data:', err);
            setError('Failed to load configuration data');
            setIsInitialized(true);
        }
    };

    const handleSubmit = async () => {
        if (!user) return;
        setIsSubmitting(true);
        setError(null);

        try {
            const update: AccessUserUpdate = {};

            if (selectedRoleId !== user.role_id) {
                update.role_id = selectedRoleId ?? undefined;
            }
            if (selectedDeptId !== user.department_id) {
                update.department_id = selectedDeptId;
            }
            if (selectedManagerId !== user.manager_id) {
                update.manager_id = selectedManagerId;
            }
            if (canManagePrivileged && selectedScope !== user.access_scope) {
                update.access_scope = selectedScope;
            }

            await accessApi.updateAccessUser(user.id, update);
            onSaved();
            onClose();
        } catch (err: unknown) {
            console.error('Failed to update user access:', err);
            setError(err instanceof Error ? err.message : 'Failed to update access settings');
        } finally {
            setIsSubmitting(false);
        }
    };

    const hasChanges = user && (
        selectedRoleId !== user.role_id ||
        selectedDeptId !== user.department_id ||
        selectedManagerId !== user.manager_id ||
        (canManagePrivileged && selectedScope !== user.access_scope)
    );

    if (!user) return null;

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence mode="wait">
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="relative glass-card w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-white/5"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                            <div>
                                <h3 className="text-xl font-bold text-white tracking-tight">
                                    Edit Access Settings
                                </h3>
                                <p className="text-xs text-slate-500 font-medium">{user.name}</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 glass rounded-lg text-slate-500 hover:text-white transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            {!isInitialized ? (
                                <div className="py-20 flex flex-col items-center justify-center gap-4">
                                    <Loader2 className="h-10 w-10 text-accent animate-spin" />
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('loading.generic')}</p>
                                </div>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="space-y-6"
                                >
                                    {/* Role Selection */}
                                    <div className="space-y-3">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <Shield className="h-4 w-4 text-purple-400" />
                                            Role
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {roles.map((role) => (
                                                <button
                                                    key={role.id}
                                                    onClick={() => setSelectedRoleId(role.id)}
                                                    className={`p-3 rounded-xl border text-left transition-all ${selectedRoleId === role.id
                                                        ? 'bg-purple-500/10 border-purple-500'
                                                        : 'bg-white/5 border-white/5 hover:bg-white/10'
                                                        }`}
                                                >
                                                    <p className={`text-sm font-bold ${selectedRoleId === role.id ? 'text-purple-400' : 'text-white'}`}>
                                                        {role.display_name}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500">{role.permissions.length} permissions</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Department Selection */}
                                    <div className="space-y-3">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-blue-400" />
                                            Department
                                        </label>
                                        <ThemedSelect
                                            value={selectedDeptId?.toString() ?? ''}
                                            onValueChange={(v) => setSelectedDeptId(v ? Number(v) : null)}
                                            placeholder="No department"
                                            allowEmpty
                                            emptyLabel="No department"
                                            className="w-full"
                                            options={departments.map(dept => ({ value: dept.id.toString(), label: dept.name }))}
                                        />
                                    </div>

                                    {/* Manager Selection */}
                                    <div className="space-y-3">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <User className="h-4 w-4 text-emerald-400" />
                                            Reports To
                                        </label>
                                        <ThemedSelect
                                            value={selectedManagerId?.toString() ?? ''}
                                            onValueChange={(v) => setSelectedManagerId(v ? Number(v) : null)}
                                            placeholder="No manager (Top Level)"
                                            allowEmpty
                                            emptyLabel="No manager (Top Level)"
                                            className="w-full"
                                            options={allUsers.map(u => ({ value: u.id.toString(), label: u.name }))}
                                        />
                                    </div>

                                    {/* Access Scope (Admin/CRO only) */}
                                    {canManagePrivileged && (
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <Crown className="h-4 w-4 text-amber-400" />
                                                Access Scope
                                            </label>
                                            <div className="space-y-2">
                                                {SCOPE_OPTIONS.map((option) => (
                                                    <button
                                                        key={option.value}
                                                        onClick={() => setSelectedScope(option.value)}
                                                        className={`w-full p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${selectedScope === option.value
                                                            ? 'bg-amber-500/10 border-amber-500'
                                                            : 'bg-white/5 border-white/5 hover:bg-white/10'
                                                            }`}
                                                    >
                                                        <div className={`w-6 h-6 rounded flex items-center justify-center ${selectedScope === option.value ? 'bg-amber-500 text-white' : 'bg-white/10 text-slate-600'
                                                            }`}>
                                                            {selectedScope === option.value && <Check className="h-4 w-4" />}
                                                        </div>
                                                        <div>
                                                            <p className={`text-sm font-bold ${selectedScope === option.value ? 'text-amber-400' : 'text-white'}`}>
                                                                {option.label}
                                                            </p>
                                                            <p className="text-[10px] text-slate-500">{option.description}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-white/5 bg-white/5">
                            {error && (
                                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[10px] font-bold uppercase tracking-wider">
                                    {error}
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                    {hasChanges ? (
                                        <>
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                            Unsaved changes
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                            No changes
                                        </>
                                    )}
                                </span>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={onClose}
                                        className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={!hasChanges || isSubmitting || !isInitialized}
                                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-white text-xs font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg active:scale-95"
                                    >
                                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
