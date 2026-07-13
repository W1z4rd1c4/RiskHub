import { useId } from 'react';
import { Loader2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import type { OrphanedItem } from '@/types/orphanedItem';
import { useTranslation } from '@/i18n/hooks';
import { DialogShell } from '@/components/DialogShell';

import { ResolveOrphanDepartmentSelection } from './ResolveOrphanDepartmentSelection';
import { ResolveOrphanFooter } from './ResolveOrphanFooter';
import { ResolveOrphanOwnerSelection } from './ResolveOrphanOwnerSelection';
import { ResolveOrphanRiskSelection } from './ResolveOrphanRiskSelection';
import { ResolveOrphanSummary } from './ResolveOrphanSummary';
import { useResolveOrphanWorkflow } from './useResolveOrphanWorkflow';

interface ResolveOrphanModalProps {
    isOpen: boolean;
    onClose: () => void;
    orphan: OrphanedItem | null;
    onResolved: () => void;
}

export function ResolveOrphanModal({ isOpen, onClose, orphan, onResolved }: ResolveOrphanModalProps) {
    const { i18n } = useTranslation('common');
    const { t: tAdmin } = useTranslation('admin');
    const workflow = useResolveOrphanWorkflow({ isOpen, onClose, onResolved, orphan });
    const titleId = useId();
    const descriptionId = useId();

    if (!orphan) return null;

    const requirements = workflow.requirements;
    if (!requirements) return null;

    const isKri = requirements.isKri;
    const shouldShowOwner = requirements.shouldShowOwner;
    const shouldShowRisk = requirements.shouldShowRisk;

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            titleId={titleId}
            descriptionIds={[descriptionId]}
            backdropClassName="absolute inset-0 bg-black/80 backdrop-blur-sm"
            contentClassName="glass-card w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border-white/5"
        >
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div>
                    <h3 id={titleId} className="text-xl font-bold text-white tracking-tight">
                        {isKri
                            ? tAdmin('governance.resolve_modal.link_to_risk')
                            : tAdmin('governance.resolve_modal.resolve_orphaned_item')}
                    </h3>
                    <p id={descriptionId} className="text-xs text-slate-500 font-medium">
                        {tAdmin('governance.resolve_modal.configure_ownership')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={tAdmin('common:actions.close')}
                    className="p-2 glass rounded-lg text-slate-500 hover:text-white transition-colors"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                {!workflow.isInitialized && (
                    <div className="py-20 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="h-10 w-10 text-accent animate-spin" />
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                            {tAdmin('governance.resolve_modal.initializing')}
                        </p>
                    </div>
                )}

                {workflow.isInitialized && (
                    <motion.div
                        data-testid="resolve-orphan-ready"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-8"
                    >
                        <ResolveOrphanSummary language={i18n.language} orphan={orphan} />

                        <div className="space-y-8">
                            {shouldShowRisk && (
                                <ResolveOrphanRiskSelection
                                    filteredRisks={workflow.filteredRisks}
                                    riskSearchQuery={workflow.riskSearchQuery}
                                    selectedRiskDept={workflow.selectedRiskDept}
                                    selectedRiskId={workflow.selectedRiskId}
                                    setRiskSearchQuery={workflow.setRiskSearchQuery}
                                    setSelectedRiskDept={workflow.setSelectedRiskDept}
                                    setSelectedRiskId={workflow.setSelectedRiskId}
                                    uniqueDepartments={workflow.uniqueDepartments}
                                />
                            )}

                            {shouldShowOwner && (
                                <ResolveOrphanOwnerSelection
                                    handleSelectUser={workflow.handleSelectUser}
                                    orphanDepartmentName={orphan.department_name}
                                    searchQuery={workflow.searchQuery}
                                    selectedDeptFilter={workflow.selectedDeptFilter}
                                    selectedUserId={workflow.selectedUserId}
                                    setSearchQuery={workflow.setSearchQuery}
                                    setSelectedDeptFilter={workflow.setSelectedDeptFilter}
                                    sortedUsers={workflow.sortedUsers}
                                />
                            )}

                            {(orphan.item_type === 'control' && !workflow.selectedUserId) && (
                                <ResolveOrphanDepartmentSelection
                                    departments={workflow.allDepartments}
                                    selectedDepartmentId={workflow.selectedDepartmentId}
                                    setSelectedDepartmentId={workflow.setSelectedDepartmentId}
                                />
                            )}
                        </div>
                    </motion.div>
                )}
            </div>

            <ResolveOrphanFooter
                canSubmit={workflow.canSubmit}
                errorKey={workflow.errorKey}
                isKri={isKri}
                isSubmitting={workflow.isSubmitting}
                onClose={onClose}
                onSubmit={workflow.handleSubmit}
                selectedRiskId={workflow.selectedRiskId}
                selectedUserId={workflow.selectedUserId}
                shouldShowOwner={shouldShowOwner}
                shouldShowRisk={shouldShowRisk}
            />
        </DialogShell>
    );
}
