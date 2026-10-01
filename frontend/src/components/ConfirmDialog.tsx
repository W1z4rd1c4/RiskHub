import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { InlineMessage } from '@/components/ui/inline-message';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/i18n/hooks';
import { apiClient } from '@/services/apiClient';

import {
    confirmPresentation,
    resolveConfirmCopy,
    type ConfirmIntent,
    type ConfirmLegacyVariant,
    type ConfirmReasonPolicy,
} from './confirmDialogCopy';

export type { ConfirmIntent, ConfirmReasonPolicy };

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    /**
     * Receives the reason when a reason field is shown (untrimmed). A returned
     * promise keeps the dialog busy until it settles; a rejection is announced
     * inside the dialog, which stays open for retry.
     */
    onConfirm: (reason?: string) => unknown;
    /** Icon, action tone and default copy (D10). Defaults to `generic`. */
    intent?: ConfirmIntent;
    /** Localised entity type, e.g. "Control" ("Archive Control?"). */
    entityLabel?: string;
    /** The affected record's name, shown in the dialog body (or the unlink title). */
    entityName?: string;
    /** Count for bulk actions; switches the title to its plural form. */
    count?: number;
    /** PM-1 reason policy. */
    reason?: ConfirmReasonPolicy;
    reasonLabel?: string;
    reasonPlaceholder?: string;
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isLoading?: boolean;
    /**
     * Rejected-mutation error announced INSIDE the dialog (#100/#101 P2): the
     * shell traps focus, so a page-level banner behind the overlay is
     * unreachable while the dialog stays open for retry.
     */
    errorText?: string | null;
    /** @deprecated Use `intent`; read only for `intent="generic"`. */
    variant?: ConfirmLegacyVariant;
    /** @deprecated Use `reason="required"` or `reason="optional"`. */
    showInput?: boolean;
    /** @deprecated Use `reasonLabel`. */
    inputLabel?: string;
    /** @deprecated Use `reasonPlaceholder`. */
    inputPlaceholder?: string;
    /** @deprecated Use `reason="required"` or `reason="optional"`. */
    inputRequired?: boolean;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return typeof value === 'object'
        && value !== null
        && typeof (value as { then?: unknown }).then === 'function';
}

/**
 * The one confirmation for destructive, irreversible or outbound actions
 * (audit 2026-09-30 §4.11, D10): `role="alertdialog"` on `DialogShell` v2,
 * intent-driven icon/copy, PM-1 reason field, busy state that blocks every
 * close path, and errors kept inside the open dialog.
 */
export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    intent = 'generic',
    entityLabel,
    entityName,
    count,
    reason,
    reasonLabel,
    reasonPlaceholder,
    title,
    message,
    confirmLabel,
    cancelLabel,
    isLoading = false,
    errorText = null,
    variant = 'danger',
    showInput = false,
    inputLabel,
    inputPlaceholder,
    inputRequired = true,
}: ConfirmDialogProps) {
    const { t } = useTranslation('common');
    const titleId = useId();
    const messageId = useId();
    const entityId = useId();
    const reasonId = useId();
    const validationId = useId();
    const errorId = useId();
    const confirmRef = useRef<HTMLButtonElement>(null);
    const reasonRef = useRef<HTMLTextAreaElement>(null);
    const generationRef = useRef(0);
    const [reasonValue, setReasonValue] = useState('');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);

    const reasonPolicy: ConfirmReasonPolicy = reason
        ?? (showInput ? (inputRequired ? 'required' : 'optional') : 'none');
    const busy = isLoading || isPending;
    const presentation = confirmPresentation(intent, variant);
    const copy = resolveConfirmCopy(t, { intent, entityLabel, entityName, count });
    const resolvedMessage = message ?? copy.message;
    const resolvedReasonLabel = reasonLabel ?? inputLabel ?? copy.reasonLabel;
    const showEntity = Boolean(entityName) && intent !== 'unlink';
    const displayedError = errorText ?? submitError;

    useEffect(() => {
        if (isOpen) return;
        generationRef.current += 1;
        setReasonValue('');
        setValidationError(null);
        setSubmitError(null);
        setIsPending(false);
    }, [isOpen]);

    const handleClose = useCallback(() => {
        if (busy) return;
        setReasonValue('');
        setValidationError(null);
        setSubmitError(null);
        onClose();
    }, [busy, onClose]);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy) return;
        if (reasonPolicy === 'required' && !reasonValue.trim()) {
            setValidationError(t('errors.required_field'));
            reasonRef.current?.focus();
            return;
        }
        setValidationError(null);
        setSubmitError(null);

        const result = onConfirm(reasonPolicy === 'none' ? undefined : reasonValue);
        if (!isPromiseLike(result)) return;

        const generation = generationRef.current;
        setIsPending(true);
        Promise.resolve(result).then(
            () => {
                if (generationRef.current === generation) setIsPending(false);
            },
            (error: unknown) => {
                if (generationRef.current !== generation) return;
                setIsPending(false);
                setSubmitError(t(apiClient.toUiMessageKey(error), { ns: 'errorKeys' }));
            },
        );
    };

    const descriptionIds = [
        resolvedMessage ? messageId : '',
        showEntity ? entityId : '',
        validationError ? validationId : '',
        displayedError ? errorId : '',
    ];
    const isConfirmDisabled = reasonPolicy === 'required' && !reasonValue.trim();

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={handleClose}
            titleId={titleId}
            descriptionIds={descriptionIds}
            initialFocusRef={reasonPolicy === 'none' ? confirmRef : reasonRef}
            isBusy={busy}
            role="alertdialog"
            size="md"
        >
            <DialogHeader title={title ?? copy.title} icon={presentation.icon} tone={presentation.tone} />
            <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                <DialogBody>
                    {resolvedMessage ? (
                        <p id={messageId} className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                            {resolvedMessage}
                        </p>
                    ) : null}

                    {showEntity ? (
                        <div id={entityId} className="rounded-xl border border-border bg-nested/50 px-4 py-3">
                            {entityLabel ? <p className="text-eyebrow">{entityLabel}</p> : null}
                            <p className="truncate text-sm font-semibold text-foreground">{entityName}</p>
                        </div>
                    ) : null}

                    {reasonPolicy !== 'none' ? (
                        <div>
                            <label htmlFor={reasonId} className="block">
                                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {resolvedReasonLabel}
                                    {reasonPolicy === 'required'
                                        ? <span className="text-destructive"> *</span>
                                        : <span className="normal-case tracking-normal"> {t('labels.optional')}</span>}
                                </span>
                                <Textarea
                                    id={reasonId}
                                    ref={reasonRef}
                                    value={reasonValue}
                                    onChange={(event) => {
                                        setReasonValue(event.target.value);
                                        if (validationError) setValidationError(null);
                                    }}
                                    placeholder={reasonPlaceholder ?? inputPlaceholder ?? copy.reasonPlaceholder}
                                    rows={3}
                                    disabled={busy}
                                    aria-required={reasonPolicy === 'required'}
                                    aria-invalid={validationError ? true : undefined}
                                    aria-describedby={validationError ? validationId : undefined}
                                />
                            </label>
                            {validationError ? (
                                <p id={validationId} role="alert" className="mt-2 text-sm font-medium text-destructive">
                                    {validationError}
                                </p>
                            ) : null}
                        </div>
                    ) : null}

                    {displayedError ? (
                        <InlineMessage id={errorId} tone="danger">
                            {displayedError}
                        </InlineMessage>
                    ) : null}
                </DialogBody>
                <DialogFooter
                    cancelLabel={cancelLabel}
                    submitLabel={busy ? copy.busyLabel : (confirmLabel ?? copy.confirmLabel)}
                    submitType="submit"
                    submitRef={confirmRef}
                    submitDisabled={isConfirmDisabled}
                    intent={presentation.action}
                />
            </form>
        </DialogShell>
    );
}
