import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTranslation } from '@/i18n/hooks';

/**
 * The governed link/unlink reason dialog is reused from process, vendor, and
 * asset link contexts, so the call site names the entity namespace and every
 * key resolves inside it (`<ns>:link_approval.*`, `<ns>:form.request_reason`)
 * — a vendor-link request reads "Vendor link addition", not "Process link
 * addition". The namespace is required so new call sites cannot silently
 * inherit the wrong wording.
 */
type GovernedMutationReasonNamespace = 'assets' | 'processes' | 'vendors';

interface GovernedMutationReasonDialogProps {
    isOpen: boolean;
    isLoading?: boolean;
    kind: 'link_add' | 'link_remove' | 'link_update';
    namespace: GovernedMutationReasonNamespace;
    reasonRequired?: boolean;
    /** Rejected-mutation error shown INSIDE the open dialog (#100/#101 P2). */
    errorText?: string | null;
    onClose: () => void;
    onConfirm: (reason: string) => void;
}

export function GovernedMutationReasonDialog({
    isOpen,
    isLoading = false,
    kind,
    namespace,
    reasonRequired = true,
    errorText = null,
    onClose,
    onConfirm,
}: GovernedMutationReasonDialogProps) {
    const { t } = useTranslation(['processes', 'vendors', 'assets']);
    // D10: a removal is an unlink (Unlink icon, destructive action). Without
    // an approval requirement it reads as a plain "Remove link"; with one it
    // keeps the governed request wording and asks for the reason.
    const isRemoval = kind === 'link_remove';
    const useRequestCopy = !isRemoval || reasonRequired;
    return (
        <ConfirmDialog
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={(value) => onConfirm(value?.trim() ?? '')}
            intent={isRemoval ? 'unlink' : 'generic'}
            title={useRequestCopy ? t(`${namespace}:link_approval.${kind}.title`) : undefined}
            message={useRequestCopy ? t(`${namespace}:link_approval.${kind}.message`) : undefined}
            confirmLabel={useRequestCopy ? t(`${namespace}:link_approval.continue`) : undefined}
            isLoading={isLoading}
            reason={reasonRequired ? 'required' : 'none'}
            reasonLabel={t(`${namespace}:form.request_reason`)}
            reasonPlaceholder={t(`${namespace}:link_approval.reason_placeholder`)}
            errorText={errorText}
        />
    );
}
