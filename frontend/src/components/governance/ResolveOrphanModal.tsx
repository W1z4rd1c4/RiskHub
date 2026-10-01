import { useId } from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { OrphanedItem } from '@/types/orphanedItem';
import { useTranslation } from '@/i18n/hooks';
import { DialogBody, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import type { ApprovalCreatedResponse } from '@/types/approval';

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
    onApprovalQueued?: (response: ApprovalCreatedResponse) => void;
    onResolved: () => void;
}

export function ResolveOrphanModal({
    isOpen,
    onApprovalQueued,
    onClose,
    orphan,
    onResolved,
}: ResolveOrphanModalProps) {
    const { i18n } = useTranslation('common');
    const { t: tAdmin } = useTranslation('admin');
    const workflow = useResolveOrphanWorkflow({
        isOpen,
        onApprovalQueued,
        onClose,
        onResolved,
        orphan,
    });
    const titleId = useId();
    const descriptionId = useId();

    if (!orphan) return null;

    const requirements = workflow.requirements;
    if (!requirements) return null;

    const isKri = requirements.isKri;
    const shouldShowOwner = requirements.shouldShowOwner;
    const shouldShowRisk = requirements.shouldShowRisk;
    const shouldShowDepartment = requirements.shouldShowDepartment;

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            titleId={titleId}
            descriptionIds={[descriptionId]}
            isBusy={workflow.isSubmitting}
            size="xl"
            className="max-w-3xl"
        >
            <DialogHeader
                title={isKri
                    ? tAdmin('governance.resolve_modal.link_to_risk')
                    : tAdmin('governance.resolve_modal.resolve_orphaned_item')}
                description={(orphan.item_type === 'asset' || orphan.item_type === 'vendor') && orphan.responsibility_role
                    ? tAdmin(`governance.resolve_modal.${orphan.item_type}_${orphan.responsibility_role}`)
                    : tAdmin('governance.resolve_modal.configure_ownership')}
                descriptionId={descriptionId}
                closeLabel={tAdmin('common:actions.close')}
            />

            <DialogBody className="custom-scrollbar">
                {!workflow.isInitialized && (
                    <div className="py-20 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="h-10 w-10 text-accent animate-spin" />
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
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

                            {(shouldShowDepartment || (orphan.item_type === 'control' && !workflow.selectedUserId)) && (
                                <ResolveOrphanDepartmentSelection
                                    departments={workflow.allDepartments}
                                    isSearchable={orphan.item_type === 'process' || orphan.item_type === 'asset'}
                                    searchQuery={workflow.departmentSearchQuery}
                                    selectedDepartmentId={workflow.selectedDepartmentId}
                                    setSearchQuery={workflow.setDepartmentSearchQuery}
                                    setSelectedDepartmentId={workflow.setSelectedDepartmentId}
                                />
                            )}

                            {workflow.requestReasonRequired ? (
                                <Field
                                    label={tAdmin('governance.resolve_modal.request_reason')}
                                    required
                                    error={workflow.requestReasonInvalid
                                        ? tAdmin('governance.resolve_modal.request_reason_required')
                                        : undefined}
                                >
                                    {(control) => (
                                        <Textarea
                                            {...control}
                                            ref={workflow.requestReasonRef}
                                            data-testid="resolve-orphan-request-reason"
                                            value={workflow.requestReason}
                                            onChange={(event) => workflow.handleRequestReasonChange(event.target.value)}
                                            rows={3}
                                            className="min-h-[4.5rem]"
                                        />
                                    )}
                                </Field>
                            ) : null}
                        </div>
                    </motion.div>
                )}
            </DialogBody>

            <ResolveOrphanFooter
                canSubmit={workflow.canSubmit}
                errorKey={workflow.errorKey}
                isKri={isKri}
                isSubmitting={workflow.isSubmitting}
                isProcessReassignment={workflow.requestReasonRequired}
                onClose={onClose}
                onSubmit={workflow.handleSubmit}
                selectedRiskId={workflow.selectedRiskId}
                selectedDepartmentId={workflow.selectedDepartmentId}
                selectedUserId={workflow.selectedUserId}
                requestReasonMissing={
                    workflow.requestReasonRequired
                    && !workflow.requestReason.trim()
                }
                shouldShowOwner={shouldShowOwner}
                shouldShowRisk={shouldShowRisk}
                shouldShowDepartment={shouldShowDepartment}
            />
        </DialogShell>
    );
}
