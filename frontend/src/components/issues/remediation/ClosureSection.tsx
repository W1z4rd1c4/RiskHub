import { useTranslation } from '@/i18n/hooks';
import type { Issue } from '@/types/issue';

import {
    ISSUE_ACTION_ROW,
    ISSUE_LABEL,
    ISSUE_SECONDARY_BUTTON,
    ISSUE_SECTION_CARD,
    ISSUE_SECTION_HEADER,
    ISSUE_SECTION_TITLE,
    ISSUE_SUCCESS_BUTTON,
    ISSUE_TEXTAREA,
} from '../issueUi';
import { SummaryField } from './SummaryField';

interface ClosedSectionProps {
    issue: Issue;
}

interface ClosureSectionProps {
    canWrite: boolean;
    isReadyForValidation: boolean;
    isSubmitting: boolean;
    onCloseIssue: () => void;
    onValidationNoteChange: (value: string) => void;
    validationNote: string;
}

export function ClosedSection({ issue }: ClosedSectionProps) {
    const { t } = useTranslation('issues');

    return (
        <section className={ISSUE_SECTION_CARD} data-testid="workflow-closed-card">
            <div className={ISSUE_SECTION_HEADER}>
                <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.closure')}</h4>
            </div>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {t('workflow.closed_notice')}
            </div>
            <SummaryField
                label={t('workflow.fields.validation_note')}
                value={issue.validation_note || t('fallbacks.not_set')}
            />
        </section>
    );
}

export function ClosureSection({
    canWrite,
    isReadyForValidation,
    isSubmitting,
    onCloseIssue,
    onValidationNoteChange,
    validationNote,
}: ClosureSectionProps) {
    const { t } = useTranslation('issues');

    return (
        <section className={ISSUE_SECTION_CARD} data-testid="workflow-closure-card">
            <div className={ISSUE_SECTION_HEADER}>
                <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.closure')}</h4>
            </div>
            <div className="space-y-1.5">
                <label className={ISSUE_LABEL}>{t('workflow.fields.validation_note')}</label>
                <textarea
                    value={validationNote}
                    onChange={(event) => onValidationNoteChange(event.target.value)}
                    className={ISSUE_TEXTAREA}
                    disabled={!canWrite || isSubmitting}
                />
            </div>
            {canWrite && (
                <div className={ISSUE_ACTION_ROW}>
                    <button
                        type="button"
                        onClick={onCloseIssue}
                        disabled={isSubmitting}
                        className={isReadyForValidation ? ISSUE_SUCCESS_BUTTON : ISSUE_SECONDARY_BUTTON}
                    >
                        {t('actions.close_issue')}
                    </button>
                </div>
            )}
        </section>
    );
}
