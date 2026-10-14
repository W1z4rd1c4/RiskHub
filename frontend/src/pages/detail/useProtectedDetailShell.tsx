import { useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PendingChangeCancellationDialog } from '@/components/approvals/PendingChangeCancellationDialog';
import { PendingChangePanel, type PendingChangePanelData, type PendingChangePanelNamespace } from '@/components/approvals/PendingChangePanel';
import { LoadingState } from '@/components/ui/state';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { useFeedback } from '@/hooks/useFeedback';
import { useSessionMutationOwner } from '@/hooks/useMutationOwner';
import { useTranslation, type SafeTFunction } from '@/i18n/hooks';
import { executeGovernedMutation, governedMutationRejection } from '@/lib/governedMutationOutcome';
import { approvalsApi } from '@/services/approvalsApi';

import { resolveRegisterReturnTo } from '../shared/registerReturnContext';
import { DetailLoadUnavailableState, DetailStaleWarning } from './DetailLoadState';
import type { DetailLoadOutcome } from './useDetailQuery';

interface ProtectedRecord {
    id: number;
    pending_change?: (PendingChangePanelData & { approval_id: number | null }) | null;
}

interface ProtectedDetailShellOptions {
    entity: 'threat' | 'vendor' | 'asset' | 'process';
    namespace: PendingChangePanelNamespace;
    resource: ProtectedRecord | null;
    resourceId: number | null;
    targetName: string;
    loadOutcome: DetailLoadOutcome;
    isRetrying: boolean;
    refresh: () => Promise<unknown>;
    archive: (id: number, reason?: string) => Promise<unknown>;
    /** The adapter supplies its API's existing reason policy. */
    archiveReason: 'none' | 'optional' | 'required' | 'unavailable';
    loading?: ReactNode;
}

interface ActionTarget { id: number; name: string }
interface DialogState {
    archive: ActionTarget | null;
    cancellation: ActionTarget | null;
    archiveError: string | null;
    cancellationError: string | null;
    archiving: boolean;
    cancelling: boolean;
}
const emptyDialogs: DialogState = {
    archive: null, cancellation: null, archiveError: null, cancellationError: null,
    archiving: false, cancelling: false,
};

/** Literal namespace-qualified keys keep every adapter visible to the locale validator. */
function protectedDetailMessages(t: SafeTFunction, namespace: PendingChangePanelNamespace, targetName: string) {
    switch (namespace) {
        case 'assets': return {
            archiveFailed: t('assets:errors.archive_failed'),
            cancellationFailed: t('assets:pending_change.cancel_failed'),
            backToRegister: t('assets:actions.back_to_register'),
            archiveConfirmation: t('assets:messages.archive_confirm', { assetName: targetName }),
            reasonLabel: t('assets:form.request_reason'),
            reasonHelp: t('assets:form.request_reason_help'),
        };
        case 'processes': return {
            archiveFailed: t('processes:errors.archive_failed'),
            cancellationFailed: t('processes:pending_change.cancel_failed'),
            backToRegister: t('processes:actions.back_to_register'),
            archiveConfirmation: t('processes:messages.archive_confirm', { processName: targetName }),
            reasonLabel: t('processes:form.request_reason'),
            reasonHelp: t('processes:form.request_reason_help'),
        };
        case 'threats': return {
            archiveFailed: t('threats:errors.archive_failed'),
            cancellationFailed: t('threats:pending_change.cancel_failed'),
            backToRegister: t('threats:actions.back_to_register'),
            archiveConfirmation: t('threats:messages.archive_confirm', { threatName: targetName }),
            reasonLabel: t('threats:form.request_reason'),
            reasonHelp: t('threats:form.request_reason_help'),
        };
        case 'vendors': return {
            archiveFailed: t('vendors:errors.archive_failed'),
            cancellationFailed: t('vendors:pending_change.cancel_failed'),
            backToRegister: t('vendors:actions.back_to_register'),
            archiveConfirmation: t('vendors:messages.archive_confirm', { vendorName: targetName }),
            reasonLabel: t('vendors:form.request_reason'),
            reasonHelp: t('vendors:form.request_reason_help'),
        };
    }
}

/** Presentation of backend outcomes; permissions and reason policy stay in adapters. */
export function useProtectedDetailShell({
    entity, namespace, resource, resourceId, targetName, loadOutcome, isRetrying,
    refresh, archive, archiveReason, loading,
}: ProtectedDetailShellOptions) {
    const { t } = useTranslation(namespace);
    const { t: tCommon } = useTranslation('common');
    const navigate = useNavigate();
    const location = useLocation();
    const returnTo = resolveRegisterReturnTo(new URLSearchParams(location.search).get('return_to'), `/${namespace}`);
    const owner = useSessionMutationOwner(JSON.stringify([location.pathname, location.search, location.hash, resourceId]));
    const busy = useMemo(() => ({ epoch: owner.epoch, archive: false, cancellation: false }), [owner.epoch]);
    const [ownedDialogs, setOwnedDialogs] = useState({ epoch: owner.epoch, value: emptyDialogs });
    const dialogs = ownedDialogs.epoch === owner.epoch ? ownedDialogs.value : emptyDialogs;
    if (ownedDialogs.epoch !== owner.epoch) setOwnedDialogs({ epoch: owner.epoch, value: emptyDialogs });
    const update = (patch: Partial<DialogState>) => setOwnedDialogs((current) => (
        current.epoch === owner.epoch ? { ...current, value: { ...current.value, ...patch } } : current
    ));
    const messages = protectedDetailMessages(t, namespace, dialogs.archive?.name ?? '');
    const feedback = useFeedback();
    const announceApprovalQueued = useApprovalQueued();

    const archiveRecord = async (reason?: string) => {
        if (!dialogs.archive || busy.archive) return;
        const target = dialogs.archive;
        const isCurrent = owner.capture();
        if (!isCurrent()) return;
        busy.archive = true;
        update({ archiving: true, archiveError: null });
        try {
            const outcome = await executeGovernedMutation(() => archive(target.id, reason), isCurrent);
            if (outcome.kind === 'superseded') return;
            update({ archive: null });
            if (outcome.kind === 'pending') {
                announceApprovalQueued({ approvalId: outcome.approvalId });
                void refresh();
            } else {
                feedback.success({ title: tCommon('outcome.archived', { name: target.name }) });
                void navigate(returnTo);
            }
        } catch (error) {
            if (!isCurrent()) return;
            const rejection = governedMutationRejection(error);
            update({ archiveError: rejection.message === 'save_failed'
                ? messages.archiveFailed : tCommon(`governed_mutation.${rejection.message}`) });
        } finally {
            busy.archive = false;
            if (isCurrent()) update({ archiving: false });
        }
    };

    const cancelPendingChange = async () => {
        if (!dialogs.cancellation || busy.cancellation) return;
        const target = dialogs.cancellation;
        const isCurrent = owner.capture();
        if (!isCurrent()) return;
        busy.cancellation = true;
        update({ cancelling: true, cancellationError: null });
        try {
            await approvalsApi.cancel(target.id);
            if (!isCurrent()) return;
            update({ cancellation: null });
            void refresh();
        } catch {
            if (isCurrent()) update({ cancellationError: messages.cancellationFailed });
        } finally {
            busy.cancellation = false;
            if (isCurrent()) update({ cancelling: false });
        }
    };

    const pending = resource?.pending_change;
    return {
        returnTo,
        openArchive: () => {
            if (resource) update({ archive: { id: resource.id, name: targetName }, archiveError: null });
        },
        loadState: loadOutcome === 'loading' ? (loading ?? <LoadingState layout="page" label={tCommon('loading.generic')} />)
            : loadOutcome === 'unavailable' || (loadOutcome !== 'disabled' && !resource) ? (
                <DetailLoadUnavailableState backLabel={messages.backToRegister} isRetrying={isRetrying}
                    onBack={() => navigate(returnTo)} onRetry={resourceId === null ? undefined : () => void refresh()} />
            ) : null,
        staleWarning: loadOutcome === 'stale-with-error'
            ? <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void refresh()} /> : null,
        pendingChangePanel: pending ? (
            <PendingChangePanel pendingChange={pending} namespace={namespace} testIdPrefix={entity}
                cancelling={dialogs.cancelling}
                onCancel={pending.capabilities.can_cancel && pending.approval_id !== null ? () => {
                    update({ cancellation: { id: pending.approval_id as number, name: targetName }, cancellationError: null });
                } : undefined} />
        ) : null,
        pendingCancellationDialog: (
            <PendingChangeCancellationDialog isOpen={dialogs.cancellation !== null}
                targetName={dialogs.cancellation?.name ?? ''} isLoading={dialogs.cancelling}
                errorText={dialogs.cancellationError} onConfirm={cancelPendingChange}
                onClose={() => update({ cancellation: null, cancellationError: null })} />
        ),
        archiveDialog: (
            <ConfirmDialog isOpen={dialogs.archive !== null} intent="archive"
                entityLabel={tCommon(`labels.${entity}`)}
                message={messages.archiveConfirmation}
                onClose={() => update({ archive: null, archiveError: null })} onConfirm={archiveRecord}
                isLoading={dialogs.archiving} reason={archiveReason === 'unavailable' ? 'optional' : archiveReason}
                reasonLabel={messages.reasonLabel} reasonPlaceholder={messages.reasonHelp}
                confirmDisabled={archiveReason === 'unavailable'}
                errorText={dialogs.archiveError ?? (archiveReason === 'unavailable' ? tCommon('governed_mutation.capability_unavailable') : null)} />
        ),
    };
}
