import { useId, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { Button } from '@/components/ui/button';
import { DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';

interface KriMismatchDialogProps {
    isProtectedVendor?: boolean;
    isSubmitting: boolean;
    onCancel: () => void;
    onContinueWithoutLinking: () => void;
    onLinkRiskAndContinue: () => void;
}

export function KriMismatchDialog({
    isProtectedVendor = false,
    isSubmitting,
    onCancel,
    onContinueWithoutLinking,
    onLinkRiskAndContinue,
}: KriMismatchDialogProps) {
    const { t } = useTranslation(['common', 'kris']);
    const titleId = useId();
    const messageId = useId();
    const cancelRef = useRef<HTMLButtonElement>(null);
    const messageKey = isProtectedVendor
        ? 'kris:vendor_assignment.mismatch_dialog.protected_message'
        : 'kris:vendor_assignment.mismatch_dialog.message';
    const linkRiskActionKey = isProtectedVendor
        ? 'kris:vendor_assignment.mismatch_dialog.request_parent_risk_approval'
        : 'kris:vendor_assignment.mismatch_dialog.link_risk_and_continue';
    const continueActionKey = isProtectedVendor
        ? 'kris:vendor_assignment.mismatch_dialog.create_and_request_vendor_link'
        : 'kris:vendor_assignment.mismatch_dialog.continue_without_linking';

    return (
        <DialogShell
            isOpen
            onClose={onCancel}
            titleId={titleId}
            descriptionIds={[messageId]}
            role="alertdialog"
            initialFocusRef={cancelRef}
            isBusy={isSubmitting}
            size="lg"
        >
            <DialogHeader
                title={t('kris:vendor_assignment.mismatch_dialog.title')}
                description={t(messageKey)}
                descriptionId={messageId}
                icon={TriangleAlert}
                tone="warning"
            />
            <DialogFooter className="flex-wrap">
                <Button ref={cancelRef} type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
                    {t('kris:vendor_assignment.mismatch_dialog.cancel')}
                </Button>
                <Button type="button" variant="outline" onClick={onContinueWithoutLinking} disabled={isSubmitting}>
                    {t(continueActionKey)}
                </Button>
                <Button type="button" variant="accent" onClick={onLinkRiskAndContinue} disabled={isSubmitting}>
                    {t(linkRiskActionKey)}
                </Button>
            </DialogFooter>
        </DialogShell>
    );
}
