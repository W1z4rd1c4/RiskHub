import { useTranslation } from '@/i18n/hooks';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

import {
    ISSUE_ACTION_ROW,
    ISSUE_FIELD,
    ISSUE_LABEL,
    ISSUE_PRIMARY_BUTTON,
    ISSUE_SECONDARY_BUTTON,
    ISSUE_SECTION_CARD,
    ISSUE_SECTION_HEADER,
    ISSUE_SECTION_TITLE,
    ISSUE_TEXTAREA,
} from '../issueUi';
import { REMEDIATION_STATUSES } from './useRemediationPlanWorkflow';

interface ProgressSectionProps {
    blockerReason: string;
    canWrite: boolean;
    completionNotes: string;
    isInProgress: boolean;
    isSubmitting: boolean;
    onBlockerReasonChange: (value: string) => void;
    onCompletionNotesChange: (value: string) => void;
    onProgressPercentChange: (value: string) => void;
    onRemediationStatusChange: (value: string) => void;
    onUpdateProgress: () => void;
    progressPercent: string;
    remediationStatus: string;
}

export function ProgressSection({
    blockerReason,
    canWrite,
    completionNotes,
    isInProgress,
    isSubmitting,
    onBlockerReasonChange,
    onCompletionNotesChange,
    onProgressPercentChange,
    onRemediationStatusChange,
    onUpdateProgress,
    progressPercent,
    remediationStatus,
}: ProgressSectionProps) {
    const { t } = useTranslation('issues');

    return (
        <section className={ISSUE_SECTION_CARD} data-testid="workflow-progress-card">
            <div className={ISSUE_SECTION_HEADER}>
                <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.remediation_progress')}</h4>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <label className={ISSUE_LABEL}>{t('workflow.fields.progress')}</label>
                    <input
                        type="number"
                        min={0}
                        max={100}
                        value={progressPercent}
                        onChange={(event) => onProgressPercentChange(event.target.value)}
                        className={`${ISSUE_FIELD} h-10`}
                        disabled={!canWrite || isSubmitting}
                    />
                </div>
                <div className="space-y-1.5">
                    <label className={ISSUE_LABEL}>{t('workflow.fields.remediation_status')}</label>
                    <ThemedSelect
                        value={remediationStatus}
                        onValueChange={onRemediationStatusChange}
                        options={REMEDIATION_STATUSES.map((statusValue) => ({
                            value: statusValue,
                            label: t(`remediation_status.${statusValue}`, statusValue),
                        }))}
                        disabled={!canWrite || isSubmitting}
                        className="w-full"
                    />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                    <details className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                        <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-slate-400">
                            {t('workflow.sections.advanced_progress')}
                        </summary>
                        <div className="mt-3 space-y-3">
                            <div className="space-y-1.5">
                                <label className={ISSUE_LABEL}>{t('workflow.fields.blocker_reason')}</label>
                                <input
                                    type="text"
                                    value={blockerReason}
                                    onChange={(event) => onBlockerReasonChange(event.target.value)}
                                    className={ISSUE_FIELD}
                                    disabled={!canWrite || isSubmitting}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ISSUE_LABEL}>{t('workflow.fields.completion_notes')}</label>
                                <textarea
                                    value={completionNotes}
                                    onChange={(event) => onCompletionNotesChange(event.target.value)}
                                    className={ISSUE_TEXTAREA}
                                    disabled={!canWrite || isSubmitting}
                                />
                            </div>
                        </div>
                    </details>
                </div>
            </div>
            {canWrite && (
                <div className={ISSUE_ACTION_ROW}>
                    <button
                        type="button"
                        onClick={onUpdateProgress}
                        disabled={isSubmitting}
                        className={isInProgress ? ISSUE_PRIMARY_BUTTON : ISSUE_SECONDARY_BUTTON}
                    >
                        {t('actions.update_progress')}
                    </button>
                </div>
            )}
        </section>
    );
}
