/**
 * AccessEditModal component for editing user access settings.
 * Privileged users can edit role, department, manager.
 * Admin/CRO can additionally edit access_scope.
 */
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Shield, Building2, User, Loader2, Check, Crown, Mail, UserCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/i18n/hooks';
import { accessApi } from '@/services/accessApi';
import { apiClient } from '@/services/apiClient';
import { departmentApi } from '@/services/departmentApi';
import { userApi } from '@/services/userApi';
import { usePermissions } from '@/hooks/usePermissions';
import type { AccessUserRead, AccessUserUpdate, RoleWithPermissions, AccessScopeEnum } from '@/types/access';
import type { DepartmentSummary } from '@/services/departmentApi';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

interface AccessEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AccessUserRead | null;
    onSaved: () => void;
}

const SCOPE_OPTIONS: { value: AccessScopeEnum; labelKey: string; descriptionKey: string }[] = [
    { value: 'global', labelKey: 'admin:access.scopes.global', descriptionKey: 'admin:access.modal.scope_descriptions.global' },
    { value: 'department', labelKey: 'admin:access.scopes.department', descriptionKey: 'admin:access.modal.scope_descriptions.department' },
    { value: 'manager', labelKey: 'admin:access.scopes.manager', descriptionKey: 'admin:access.modal.scope_descriptions.manager' },
];

export function AccessEditModal({ isOpen, onClose, user, onSaved }: AccessEditModalProps) {
    const { canManagePrivileged, canEditAccessUsers, canManageUsers } = usePermissions();
    const { t } = useTranslation(['common', 'admin', 'errorKeys']);

    const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
    const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
    const [allUsers, setAllUsers] = useState<AccessUserRead[]>([]);

    const [selectedName, setSelectedName] = useState('');
    const [selectedEmail, setSelectedEmail] = useState('');
    const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
    const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
    const [selectedManagerId, setSelectedManagerId] = useState<number | null>(null);
    const [selectedScope, setSelectedScope] = useState<AccessScopeEnum>('manager');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [rolesData, deptsData, usersData] = await Promise.all([
                accessApi.listAccessRoles(),
                departmentApi.getDepartments(),
                accessApi.listAccessUsers(),
            ]);
            setRoles(rolesData);
            setDepartments(deptsData);
            setAllUsers(usersData.filter((u) => u.is_active && u.id !== user?.id));
            setTimeout(() => setIsInitialized(true), 100);
        } catch (err) {
            console.error('Failed to load data:', err);
            setErrorKey('errorKeys.request_failed');
            setIsInitialized(true);
        }
    }, [user?.id]);

    useEffect(() => {
        if (isOpen && user) {
            setIsInitialized(false);
            setErrorKey(null);
            setSelectedName(user.name);
            setSelectedEmail(user.email);
            setSelectedRoleId(user.role_id);
            setSelectedDeptId(user.department_id);
            setSelectedManagerId(user.manager_id);
            setSelectedScope(user.access_scope);
            void loadData();
        }
    }, [isOpen, loadData, user]);

    const handleSubmit = async () => {
        if (!user) return;
        if (!canEditAccessUsers) {
            setErrorKey('errorKeys.forbidden');
            return;
        }

        setIsSubmitting(true);
        setErrorKey(null);

        try {
            const identityUpdate = canManageUsers
                ? {
                    name: selectedName,
                    email: selectedEmail,
                }
                : null;
            const accessUpdate: AccessUserUpdate = {};

            if (selectedRoleId !== user.role_id) {
                accessUpdate.role_id = selectedRoleId ?? undefined;
            }
            if (selectedDeptId !== user.department_id) {
                accessUpdate.department_id = selectedDeptId;
            }
            if (selectedManagerId !== user.manager_id) {
                accessUpdate.manager_id = selectedManagerId;
            }
            if (canManagePrivileged && selectedScope !== user.access_scope) {
                accessUpdate.access_scope = selectedScope;
            }

            const hasIdentityChanges = canManageUsers
                && (selectedName !== user.name || selectedEmail !== user.email);
            const hasAccessChanges =
                selectedRoleId !== user.role_id
                || selectedDeptId !== user.department_id
                || selectedManagerId !== user.manager_id
                || (canManagePrivileged && selectedScope !== user.access_scope);

            if (hasAccessChanges) {
                await accessApi.updateAccessUser(user.id, accessUpdate);
            }
            if (hasIdentityChanges && identityUpdate) {
                await userApi.updateUser(user.id, identityUpdate);
            }
            onSaved();
            onClose();
        } catch (err: unknown) {
            console.error('Failed to update user access:', err);
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    const hasChanges = user && (
        (canManageUsers && (selectedName !== user.name || selectedEmail !== user.email)) ||
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
                                    {t('access.modal.title', { ns: 'admin' })}
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
                                    {canManageUsers && (
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <UserCircle className="h-4 w-4 text-accent" />
                                                {t('user_new.personal_information', { ns: 'admin' })}
                                            </label>
                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                                        {t('user_new.full_name', { ns: 'admin' })}
                                                    </label>
                                                    <div className="relative">
                                                        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                                        <input
                                                            type="text"
                                                            value={selectedName}
                                                            onChange={(event) => setSelectedName(event.target.value)}
                                                            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-accent/50"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                                        {t('user_new.email_address', { ns: 'admin' })}
                                                    </label>
                                                    <div className="relative">
                                                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                                        <input
                                                            type="email"
                                                            value={selectedEmail}
                                                            onChange={(event) => setSelectedEmail(event.target.value)}
                                                            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-accent/50"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Role Selection */}
                                    <div className="space-y-3">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <Shield className="h-4 w-4 text-purple-400" />
                                            {t('common:labels.role')}
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
                                                    <p className="text-[10px] text-slate-500">{t('access.modal.permissions_count', { ns: 'admin', count: role.permissions.length })}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Department Selection */}
                                    <div className="space-y-3">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-blue-400" />
                                            {t('common:labels.department')}
                                        </label>
                                        <ThemedSelect
                                            value={selectedDeptId?.toString() ?? ''}
                                            onValueChange={(v) => setSelectedDeptId(v ? Number(v) : null)}
                                            placeholder={t('access.table.no_department', { ns: 'admin' })}
                                            allowEmpty
                                            emptyLabel={t('access.table.no_department', { ns: 'admin' })}
                                            className="w-full"
                                            options={departments.map(dept => ({ value: dept.id.toString(), label: dept.name }))}
                                        />
                                    </div>

                                    {/* Manager Selection */}
                                    <div className="space-y-3">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <User className="h-4 w-4 text-emerald-400" />
                                            {t('access.modal.reports_to', { ns: 'admin' })}
                                        </label>
                                        <ThemedSelect
                                            value={selectedManagerId?.toString() ?? ''}
                                            onValueChange={(v) => setSelectedManagerId(v ? Number(v) : null)}
                                            placeholder={t('access.modal.no_manager_top_level', { ns: 'admin' })}
                                            allowEmpty
                                            emptyLabel={t('access.modal.no_manager_top_level', { ns: 'admin' })}
                                            className="w-full"
                                            options={allUsers.map(u => ({ value: u.id.toString(), label: u.name }))}
                                        />
                                    </div>

                                    {/* Access Scope (Admin/CRO only) */}
                                    {canManagePrivileged && (
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <Crown className="h-4 w-4 text-amber-400" />
                                                {t('access.access_scope', { ns: 'admin' })}
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
                                                                {t(option.labelKey)}
                                                            </p>
                                                            <p className="text-[10px] text-slate-500">{t(option.descriptionKey)}</p>
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
                            {errorKey && (
                                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[10px] font-bold uppercase tracking-wider">
                                    {t(errorKey, { ns: 'errorKeys' })}
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                    {hasChanges ? (
                                        <>
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                            {t('access.modal.unsaved_changes', { ns: 'admin' })}
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                            {t('access.modal.no_changes', { ns: 'admin' })}
                                        </>
                                    )}
                                </span>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={onClose}
                                        className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                                    >
                                        {t('actions.cancel', { ns: 'common' })}
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={!hasChanges || isSubmitting || !isInitialized}
                                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-white text-xs font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg active:scale-95"
                                    >
                                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                        {isSubmitting ? t('loading.generic', { ns: 'common' }) : t('actions.save', { ns: 'common' })}
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
