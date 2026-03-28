import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, UserCheck, ShieldAlert, ClipboardList, Calendar, User, Search, Check, Building2, Crown, Loader2, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { userApi } from '@/services/userApi';
import { orphanedItemsApi } from '@/services/orphanedItemsApi';
import { departmentApi } from '@/services/departmentApi';
import { controlApi } from '@/services/controlApi';
import { riskApi } from '@/services/riskApi';
import { apiClient } from '@/services/apiClient';
import type { RiskSummary } from '@/types/risk';
import type { UserRead } from '@/types/user';
import type { DepartmentSummary } from '@/services/departmentApi';
import type { OrphanedItem } from '@/types/orphanedItem';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { formatRelativeDateValue } from '@/i18n/formatters';

interface ResolveOrphanModalProps {
    isOpen: boolean;
    onClose: () => void;
    orphan: OrphanedItem | null;
    onResolved: () => void;
}

interface UserOption {
    id: number;
    name: string;
    email: string;
    department_id: number | null;
    department_name?: string;
    employee_type?: string;
}

type OrphanUserRead = UserRead & {
    department_name?: string;
    employee_type?: string;
};

export function ResolveOrphanModal({ isOpen, onClose, orphan, onResolved }: ResolveOrphanModalProps) {
    const { t, i18n } = useTranslation('common');
    const { t: tAdmin } = useTranslation('admin');
    const [users, setUsers] = useState<UserOption[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
    const [selectedRiskId, setSelectedRiskId] = useState<number | null>(null);
    const [allDepartments, setAllDepartments] = useState<DepartmentSummary[]>([]);
    const [allRisks, setAllRisks] = useState<RiskSummary[]>([]);
    const [linkedRisks, setLinkedRisks] = useState<import('@/types/control').ControlRiskLink[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [riskSearchQuery, setRiskSearchQuery] = useState('');
    const [selectedDeptFilter, setSelectedDeptFilter] = useState<string | null>(null);

    // Initialized state to prevent flashing
    const [isInitialized, setIsInitialized] = useState(false);

    // Risk filter states
    const [selectedRiskDept, setSelectedRiskDept] = useState('');

    // Computed unique values for risk filters
    const uniqueDepartments = [...new Set(allRisks.map(r => r.department_name).filter(Boolean))].sort() as string[];

    const filteredRisks = allRisks.filter(risk => {
        const matchesSearch = !riskSearchQuery ||
            risk.name?.toLowerCase().includes(riskSearchQuery.toLowerCase()) ||
            risk.risk_id_code?.toLowerCase().includes(riskSearchQuery.toLowerCase()) ||
            risk.process?.toLowerCase().includes(riskSearchQuery.toLowerCase()) ||
            risk.category?.toLowerCase().includes(riskSearchQuery.toLowerCase()) ||
            risk.description?.toLowerCase().includes(riskSearchQuery.toLowerCase()) ||
            risk.department_name?.toLowerCase().includes(riskSearchQuery.toLowerCase());

        const matchesDept = !selectedRiskDept || risk.department_name === selectedRiskDept;

        return matchesSearch && matchesDept;
    });

    const fetchControlStatus = useCallback(async () => {
        if (orphan?.item_type === 'control') {
            const risks = await controlApi.getLinkedRisks(orphan.item_id);
            setLinkedRisks(risks);
        }
    }, [orphan?.item_id, orphan?.item_type]);

    const loadDepartments = useCallback(async () => {
        const depts = await departmentApi.getDepartments();
        setAllDepartments(depts);
    }, []);

    const loadRisks = useCallback(async () => {
        const res = await riskApi.getRisks({ limit: 100 });
        setAllRisks(res.items);
    }, []);

    const loadUsers = useCallback(async () => {
        const activeUsers = (await userApi.listUsers(0, 100)) as OrphanUserRead[];
        setUsers(
            activeUsers
                .filter((u) => u.is_active)
                .map((u) => ({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    department_id: u.department_id,
                    department_name: u.department_name,
                    employee_type: u.employee_type,
                })),
        );
    }, []);

    const initializeData = useCallback(async () => {
        try {
            // Fetch everything in parallel
            const promises: Promise<unknown>[] = [
                loadUsers(),
                loadDepartments()
            ];

            if (orphan?.item_type === 'control' || orphan?.item_type === 'kri') {
                promises.push(loadRisks());
            }

            if (orphan?.item_type === 'control') {
                promises.push(fetchControlStatus());
            }

            await Promise.all(promises);
            // Small artificial delay to prevent sub-millisecond flicker if cache hits
            setTimeout(() => setIsInitialized(true), 150);
        } catch (err) {
            console.error('Failed to initialize resolution data:', err);
            setErrorKey(apiClient.toUiMessageKey(err));
        }
    }, [fetchControlStatus, loadDepartments, loadRisks, loadUsers, orphan?.item_type]);

    useEffect(() => {
        if (isOpen) {
            // Reset all states
            setIsInitialized(false);
            setLinkedRisks([]);
            setSelectedUserId(null);
            setSelectedDepartmentId(null);
            setSelectedRiskId(null);
            setErrorKey(null);
            setSearchQuery('');
            setRiskSearchQuery('');
            setSelectedDeptFilter(null);
            setSelectedRiskDept('');

            if (orphan) {
                void initializeData();
            }
        }
    }, [initializeData, isOpen, orphan]);

    const handleSubmit = async () => {
        if (!orphan) return;
        setIsSubmitting(true);
        setErrorKey(null);

        try {
            await orphanedItemsApi.resolveOrphan(orphan.id, {
                new_owner_id: selectedUserId || undefined,
                department_id: selectedDepartmentId || undefined,
                target_risk_id: selectedRiskId || undefined
            });
            onResolved();
            onClose();
        } catch (err: unknown) {
            console.error('Failed to resolve orphan:', err);
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!orphan) return null;

    const isKri = orphan.item_type === 'kri';
    const Icon = orphan.item_type === 'risk' ? ShieldAlert : ClipboardList;
    const typeColor = orphan.item_type === 'risk' ? 'text-rose-400' : 'text-accent';
    const typeBg = orphan.item_type === 'risk' ? 'bg-rose-500/10' : 'bg-accent/10';

    const filteredUsers = users.filter(user => {
        const matchesSearch =
            user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDept = !selectedDeptFilter || user.department_name === selectedDeptFilter;
        return matchesSearch && matchesDept;
    });

    const sortedUsers = [...filteredUsers].sort((a, b) => {
        if (orphan.department_name) {
            const aMatch = a.department_name === orphan.department_name;
            const bMatch = b.department_name === orphan.department_name;
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            if (aMatch && bMatch) {
                if (a.employee_type === 'head' && b.employee_type !== 'head') return -1;
                if (a.employee_type !== 'head' && b.employee_type === 'head') return 1;
            }
        }
        return a.name.localeCompare(b.name);
    });

    const handleSelectUser = (user: UserOption) => {
        setSelectedUserId(user.id);
        setSelectedDepartmentId(user.department_id);
    };

    const shouldShowOwner = !isKri;
    const shouldShowRisk = isKri || (
        orphan.item_type === 'control' && (isInitialized && linkedRisks.length === 0)
    );

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence mode="wait">
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="relative glass-card w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-white/5"
                    >
                        {/* Header Section - Clean and Consistent */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                            <div>
                                <h3 className="text-xl font-bold text-white tracking-tight">
                                    {isKri
                                        ? tAdmin('governance.resolve_modal.link_to_risk')
                                        : tAdmin('governance.resolve_modal.resolve_orphaned_item')}
                                </h3>
                                <p className="text-xs text-slate-500 font-medium">
                                    {tAdmin('governance.resolve_modal.configure_ownership')}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 glass rounded-lg text-slate-500 hover:text-white transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                            {!isInitialized && (
                                <div className="py-20 flex flex-col items-center justify-center gap-4">
                                    <Loader2 className="h-10 w-10 text-accent animate-spin" />
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                        {tAdmin('governance.resolve_modal.initializing')}
                                    </p>
                                </div>
                            )}

                            {isInitialized && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="space-y-8"
                                >
                                    {/* Item Detail Summary Bubble */}
                                    <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex items-start gap-5">
                                        <div className={`p-3 rounded-xl ${typeBg} border border-white/5 shrink-0`}>
                                            <Icon className={`h-6 w-6 ${typeColor}`} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${typeBg} ${typeColor}`}>
                                                    {orphan.item_type}
                                                </span>
                                            </div>
                                            <h4 className="text-lg font-bold text-white mb-3 truncate">
                                                {orphan.item_name}
                                            </h4>
                                            <div className="flex items-center gap-6">
                                                <div className="flex items-center gap-2">
                                                    <User className="h-3.5 w-3.5 text-slate-500" />
                                                    <span className="text-xs text-slate-400 font-medium">{orphan.previous_owner_name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-3.5 w-3.5 text-slate-500" />
                                                    <span className="text-xs text-slate-400 font-medium">
                                                        {formatRelativeDateValue(orphan.orphaned_at, i18n.language)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-8">
                                        {/* Risk Linkage Section */}
                                        {shouldShowRisk && (
                                            <div className="space-y-4">
                                                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                    <Target className="h-4 w-4 text-accent" />
                                                    {tAdmin('governance.resolve_modal.select_risk_to_link')}
                                                </h5>
                                                <div className="space-y-3">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                        <ThemedSelect
                                                            value={selectedRiskDept}
                                                            onValueChange={setSelectedRiskDept}
                                                            placeholder={t('filters.all_departments')}
                                                            allowEmpty
                                                            emptyLabel={t('filters.all_departments')}
                                                            options={uniqueDepartments.map(d => ({ value: d, label: d }))}
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder={t('filters.search_risks')}
                                                            value={riskSearchQuery}
                                                            onChange={(e) => setRiskSearchQuery(e.target.value)}
                                                            className="col-span-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-accent/40"
                                                        />
                                                    </div>

                                                    <div className="max-h-[200px] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5 custom-scrollbar">
                                                        {filteredRisks.map(risk => (
                                                            <button
                                                                key={risk.id}
                                                                onClick={() => setSelectedRiskId(risk.id)}
                                                                className={`w-full text-left p-3 flex items-center gap-3 transition-colors ${selectedRiskId === risk.id ? 'bg-accent/10' : 'hover:bg-white/5'}`}
                                                            >
                                                                <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${selectedRiskId === risk.id ? 'bg-accent text-white' : 'bg-white/5 text-slate-600'}`}>
                                                                    <Target className="h-3.5 w-3.5" />
                                                                </div>
                                                                <div className="flex-1 min-w-0 flex flex-col">
                                                                    <p className="text-sm font-bold text-slate-200 leading-tight mb-1">{risk.name}</p>
                                                                    <p className="text-[10px] text-slate-500 line-clamp-1 italic">{risk.description}</p>
                                                                </div>
                                                                {selectedRiskId === risk.id && <Check className="h-4 w-4 text-accent" />}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Owner Assignment Section */}
                                        {shouldShowOwner && (
                                            <div className="space-y-4">
                                                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                    <User className="h-4 w-4 text-emerald-400" />
                                                    {tAdmin('governance.resolve_modal.assign_new_owner')}
                                                </h5>
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex-1 relative">
                                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                                            <input
                                                                type="text"
                                                                placeholder={t('filters.search_items')}
                                                                value={searchQuery}
                                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
                                                            />
                                                        </div>
                                                        {orphan.department_name && (
                                                            <button
                                                                onClick={() => setSelectedDeptFilter(selectedDeptFilter === orphan.department_name ? null : orphan.department_name)}
                                                                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${selectedDeptFilter === orphan.department_name ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-500/10 text-emerald-400 border-white/10 hover:bg-emerald-500/20'}`}
                                                            >
                                                                {orphan.department_name}
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                                                        {sortedUsers.map(user => (
                                                            <button
                                                                key={user.id}
                                                                onClick={() => handleSelectUser(user)}
                                                                className={`text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${selectedUserId === user.id ? 'bg-emerald-500/10 border-emerald-500 shadow-sm' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                                            >
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${selectedUserId === user.id ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-400'}`}>
                                                                    {user.name.charAt(0)}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <p className="text-sm font-bold text-white truncate">{user.name}</p>
                                                                        {user.employee_type === 'head' && <Crown className="h-3 w-3 text-amber-500" />}
                                                                    </div>
                                                                    <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                                                                </div>
                                                                {selectedUserId === user.id && <Check className="h-4 w-4 text-emerald-500" />}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Department Assignment for Controls without selected owner */}
                                        {(orphan.item_type === 'control' && !selectedUserId) && (
                                            <div className="space-y-4">
                                                <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                    <Building2 className="h-4 w-4 text-blue-400" />
                                                    {tAdmin('governance.resolve_modal.select_department')}
                                                </h5>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                    {allDepartments.map(dept => (
                                                        <button
                                                            key={dept.id}
                                                            onClick={() => setSelectedDepartmentId(dept.id)}
                                                            className={`p-3 rounded-xl border text-center transition-all ${selectedDepartmentId === dept.id ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                                        >
                                                            <p className="text-[10px] font-bold text-slate-500 uppercase">{dept.code}</p>
                                                            <p className={`text-xs font-bold ${selectedDepartmentId === dept.id ? 'text-white' : 'text-slate-400'}`}>{dept.name}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        {/* Footer Section - Polished */}
                        <div className="p-6 border-t border-white/5 bg-white/5">
                            {errorKey && (
                                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                                    <ShieldAlert className="h-4 w-4" />
                                    {t(errorKey, { ns: 'errorKeys' })}
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <div className="flex flex-col gap-1">
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                        {(shouldShowOwner && !selectedUserId) ? (
                                            <>
                                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                {tAdmin('governance.resolve_modal.owner_selection_required')}
                                            </>
                                        ) : (shouldShowRisk && !selectedRiskId) ? (
                                            <>
                                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                {tAdmin('governance.resolve_modal.risk_linkage_required')}
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                {tAdmin('governance.resolve_modal.verified_ready')}
                                            </>
                                        )}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={onClose}
                                        className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
                                    >
                                        {t('actions.cancel')}
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={
                                            (shouldShowOwner && !selectedUserId) ||
                                            (shouldShowRisk && !selectedRiskId) ||
                                            (!isKri && !selectedUserId) ||
                                            isSubmitting ||
                                            !isInitialized
                                        }
                                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-white text-xs font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg active:scale-95"
                                    >
                                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                                        {isSubmitting
                                            ? tAdmin('governance.resolve_modal.resolving')
                                            : (isKri
                                                ? tAdmin('governance.resolve_modal.link_risk')
                                                : tAdmin('governance.resolve_modal.resolve_item'))}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div >
            )
            }
        </AnimatePresence >,
        document.body
    );
}
