import { useId, type ReactNode } from 'react';

import { translateUiMessage, useTranslation } from '@/i18n/hooks';
import { Checkbox } from '@/components/ui/checkbox';
import { DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';

interface RiskHubModalFrameProps {
    children: ReactNode;
    title: string;
    onClose: () => void;
    /** Blocks every close path while the form submits (PG-22). */
    isBusy?: boolean;
}

/**
 * Risk Hub create/edit modal on the themed DialogShell v2 surface (D5, DS-07).
 * Children render below the header: a `<form>` laid out as
 * `flex min-h-0 flex-1 flex-col` with a `DialogBody` and `RiskHubModalActions`.
 */
export function RiskHubModalFrame({ children, title, onClose, isBusy = false }: RiskHubModalFrameProps) {
    const titleId = useId();
    return (
        <DialogShell isOpen onClose={onClose} titleId={titleId} size="md" isBusy={isBusy}>
            <DialogHeader title={title} />
            {children}
        </DialogShell>
    );
}

interface RiskHubModalActionsProps {
    cancelLabel?: string;
    disableSave?: boolean;
    onCancel: () => void;
    saveLabel?: string;
    saving: boolean;
    savingLabel?: string;
}

/** Footer of a Risk Hub modal form: Cancel, then the submit action (§4.11 order). */
export function RiskHubModalActions({
    cancelLabel,
    disableSave,
    onCancel,
    saveLabel,
    saving,
    savingLabel,
}: RiskHubModalActionsProps) {
    const { t } = useTranslation(['common']);
    return (
        <DialogFooter
            onCancel={onCancel}
            cancelLabel={cancelLabel ?? t('common:actions.cancel')}
            submitType="submit"
            submitDisabled={disableSave}
            isSubmitting={saving}
            submitLabel={saving ? (savingLabel ?? t('common:loading.generic')) : (saveLabel ?? t('common:actions.save'))}
        />
    );
}

interface RiskHubFieldErrorProps {
    errorKey: string | null;
}

/**
 * The server error of a Risk Hub form, inside the open dialog (§4.16 "Error
 * inside an open dialog"; AX-05 / GAP-B-11: `InlineMessage` danger is
 * `role="alert"`, so a rejected admin action is announced).
 */
export function RiskHubFieldError({ errorKey }: RiskHubFieldErrorProps) {
    const { t } = useTranslation(['admin', 'common']);
    if (!errorKey) return null;
    return <InlineMessage tone="danger">{translateUiMessage(t, errorKey)}</InlineMessage>;
}

interface RiskHubShowArchivedToggleProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label: string;
}

/** "Show archived" filter of a Risk Hub list, named through `Field` (AX-04). */
export function RiskHubShowArchivedToggle({ checked, onCheckedChange, label }: RiskHubShowArchivedToggleProps) {
    return (
        <Field
            layout="inline"
            label={label}
            className="items-center gap-2"
            labelClassName="font-normal text-muted-foreground"
        >
            {(field) => <Checkbox {...field} checked={checked} onCheckedChange={onCheckedChange} />}
        </Field>
    );
}
