import { useId, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { DialogShell } from '@/components/DialogShell';

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
            closeDisabled={isSubmitting}
            backdropClassName="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            contentClassName="relative w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/95 p-6 shadow-2xl"
        >
                <div className="flex items-start gap-3">
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
                        <TriangleAlert className="h-5 w-5 text-amber-400" />
                    </div>
                    <div>
                        <h3 id={titleId} className="text-lg font-black text-white">
                            {t('kris:vendor_assignment.mismatch_dialog.title')}
                        </h3>
                        <p id={messageId} className="mt-2 text-sm leading-relaxed text-slate-400">
                            {t(messageKey)}
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                    <button
                        type="button"
                        onClick={onLinkRiskAndContinue}
                        className="btn-primary justify-center"
                        disabled={isSubmitting}
                    >
                        {t(linkRiskActionKey)}
                    </button>
                    <button
                        type="button"
                        onClick={onContinueWithoutLinking}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/[0.06]"
                        disabled={isSubmitting}
                    >
                        {t(continueActionKey)}
                    </button>
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={onCancel}
                        className="w-full rounded-xl px-4 py-3 text-sm font-bold text-slate-400 transition-colors hover:text-white"
                        disabled={isSubmitting}
                    >
                        {t('kris:vendor_assignment.mismatch_dialog.cancel')}
                    </button>
                </div>
        </DialogShell>
    );
}
