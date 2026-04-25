import { useTranslation } from '@/i18n/hooks';

import {
    ISSUE_ACTION_ROW,
    ISSUE_FIELD,
    ISSUE_LABEL,
    ISSUE_SECONDARY_BUTTON,
    ISSUE_SECTION_CARD,
    ISSUE_SECTION_HEADER,
    ISSUE_SECTION_TITLE,
    ISSUE_TEXTAREA,
    ISSUE_WARNING_BUTTON,
} from '../issueUi';

interface ExceptionSectionProps {
    canApprove: boolean;
    canWrite: boolean;
    exceptionExpiresAt: string;
    exceptionReason: string;
    isInProgress: boolean;
    isSubmitting: boolean;
    onApproveException: () => void;
    onExceptionExpiresAtChange: (value: string) => void;
    onExceptionReasonChange: (value: string) => void;
    onRequestException: () => void;
    requestedExceptionId: number | undefined;
}

export function ExceptionSection({
    canApprove,
    canWrite,
    exceptionExpiresAt,
    exceptionReason,
    isInProgress,
    isSubmitting,
    onApproveException,
    onExceptionExpiresAtChange,
    onExceptionReasonChange,
    onRequestException,
    requestedExceptionId,
}: ExceptionSectionProps) {
    const { t } = useTranslation('issues');

    return (
        <section className={ISSUE_SECTION_CARD} data-testid="workflow-exception-card">
            <div className={ISSUE_SECTION_HEADER}>
                <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.exception_handling')}</h4>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                    <label className={ISSUE_LABEL}>{t('workflow.fields.exception_reason')}</label>
                    <textarea
                        value={exceptionReason}
                        onChange={(event) => onExceptionReasonChange(event.target.value)}
                        className={ISSUE_TEXTAREA}
                        disabled={!canWrite || isSubmitting}
                    />
                </div>
                {canApprove && requestedExceptionId && (
                    <div className="space-y-1.5">
                        <label className={ISSUE_LABEL}>{t('workflow.fields.approve_until')}</label>
                        <input
                            type="datetime-local"
                            value={exceptionExpiresAt}
                            onChange={(event) => onExceptionExpiresAtChange(event.target.value)}
                            className={`${ISSUE_FIELD} h-10`}
                            disabled={isSubmitting}
                        />
                    </div>
                )}
            </div>
            <div className={ISSUE_ACTION_ROW}>
                {canWrite && (
                    <button
                        type="button"
                        onClick={onRequestException}
                        disabled={isSubmitting}
                        className={isInProgress ? ISSUE_WARNING_BUTTON : ISSUE_SECONDARY_BUTTON}
                    >
                        {t('actions.request_exception')}
                    </button>
                )}
                {canApprove && requestedExceptionId && (
                    <button
                        type="button"
                        onClick={onApproveException}
                        disabled={isSubmitting}
                        className={ISSUE_SECONDARY_BUTTON}
                    >
                        {t('actions.approve_exception')}
                    </button>
                )}
            </div>
            {canApprove && !requestedExceptionId && (
                <p className="text-sm text-slate-500">{t('workflow.messages.no_requested_exception')}</p>
            )}
        </section>
    );
}
