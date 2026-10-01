import { ShieldAlert, UserCheck } from 'lucide-react';

import { DialogFooter } from '@/components/ui/dialog';
import { InlineMessage } from '@/components/ui/inline-message';
import { useTranslation } from '@/i18n/hooks';

interface ResolveOrphanFooterProps {
    canSubmit: boolean;
    errorKey: string | null;
    isKri: boolean;
    isProcessReassignment: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: () => void;
    selectedRiskId: number | null;
    requestReasonMissing: boolean;
    selectedDepartmentId: number | null;
    selectedUserId: number | null;
    shouldShowOwner: boolean;
    shouldShowRisk: boolean;
    shouldShowDepartment: boolean;
}

export function ResolveOrphanFooter({
    canSubmit,
    errorKey,
    isKri,
    isProcessReassignment,
    isSubmitting,
    onClose,
    onSubmit,
    selectedRiskId,
    requestReasonMissing,
    selectedDepartmentId,
    selectedUserId,
    shouldShowOwner,
    shouldShowRisk,
    shouldShowDepartment,
}: ResolveOrphanFooterProps) {
    const { t } = useTranslation('common');
    const { t: tAdmin } = useTranslation('admin');
    let requirementMessageKey = 'governance.resolve_modal.verified_ready';
    if (shouldShowRisk && !selectedRiskId) {
        requirementMessageKey = 'governance.resolve_modal.risk_linkage_required';
    } else if (shouldShowOwner && !selectedUserId) {
        requirementMessageKey = 'governance.resolve_modal.owner_selection_required';
    } else if (shouldShowDepartment && !selectedDepartmentId) {
        requirementMessageKey = 'governance.resolve_modal.department_selection_required';
    } else if (requestReasonMissing) {
        requirementMessageKey = 'governance.resolve_modal.request_reason_required';
    }
    const requirementsMissing = requirementMessageKey !== 'governance.resolve_modal.verified_ready';

    let submitLabelKey = 'governance.resolve_modal.resolve_item';
    if (isSubmitting) {
        submitLabelKey = isProcessReassignment
            ? 'governance.resolve_modal.submitting_for_approval'
            : 'governance.resolve_modal.resolving';
    } else if (isProcessReassignment) {
        submitLabelKey = 'governance.resolve_modal.submit_for_approval';
    } else if (isKri) {
        submitLabelKey = 'governance.resolve_modal.link_risk';
    }

    return (
        <>
            {errorKey && (
                <div className="px-6 pb-4">
                    <InlineMessage tone="danger" icon={ShieldAlert}>
                        {t(errorKey, { ns: 'errorKeys' })}
                    </InlineMessage>
                </div>
            )}
            <DialogFooter
                extra={(
                    <p className="text-eyebrow flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 rounded-full ${
                                requirementsMissing ? 'bg-destructive' : 'bg-success'
                            }`}
                        />
                        {tAdmin(requirementMessageKey)}
                    </p>
                )}
                onCancel={onClose}
                cancelLabel={t('actions.cancel')}
                submitLabel={tAdmin(submitLabelKey)}
                submitIcon={<UserCheck aria-hidden="true" />}
                onSubmit={onSubmit}
                submitDisabled={!canSubmit}
                isSubmitting={isSubmitting}
            />
        </>
    );
}
