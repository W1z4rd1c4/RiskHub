import { GovernedMutationReasonDialog } from '@/components/approvals/GovernedMutationReasonDialog';

import { KriMismatchDialog } from './KriMismatchDialog';

interface KriCreateOptions {
    linkRiskFirst?: boolean;
}

interface KriCreateDialogsProps {
    isMismatchDialogOpen: boolean;
    isProtectedVendor: boolean;
    isSubmitting: boolean;
    pendingGovernedCreate: KriCreateOptions | null;
    onCancelGoverned: () => void;
    onCancelMismatch: () => void;
    onConfirmGoverned: (requestReason: string) => void;
    onCreate: (options: KriCreateOptions) => void;
}

export function KriCreateDialogs({
    isMismatchDialogOpen,
    isProtectedVendor,
    isSubmitting,
    pendingGovernedCreate,
    onCancelGoverned,
    onCancelMismatch,
    onConfirmGoverned,
    onCreate,
}: KriCreateDialogsProps) {
    return (
        <>
            {isMismatchDialogOpen ? (
                <KriMismatchDialog
                    isProtectedVendor={isProtectedVendor}
                    isSubmitting={isSubmitting}
                    onCancel={onCancelMismatch}
                    onContinueWithoutLinking={() => onCreate({ linkRiskFirst: false })}
                    onLinkRiskAndContinue={() => onCreate({ linkRiskFirst: true })}
                />
            ) : null}
            {pendingGovernedCreate !== null ? (
                <GovernedMutationReasonDialog
                    isOpen
                    isLoading={isSubmitting}
                    kind="link_add"
                    namespace="vendors"
                    reasonRequired
                    onClose={onCancelGoverned}
                    onConfirm={onConfirmGoverned}
                />
            ) : null}
        </>
    );
}
