import { useTranslation } from '@/i18n/hooks';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import type { IssueOwnerLookup } from '@/types/issue';

import {
    ISSUE_ACTION_ROW,
    ISSUE_FIELD,
    ISSUE_LABEL,
    ISSUE_PRIMARY_BUTTON,
    ISSUE_SECONDARY_BUTTON,
    ISSUE_SECTION_CARD,
    ISSUE_SECTION_HEADER,
    ISSUE_SECTION_SUBTITLE,
    ISSUE_SECTION_TITLE,
} from '../issueUi';

interface AssignmentSectionProps {
    assignDueAt: string;
    assignOwnerId: string;
    canStartRemediation: boolean;
    canWrite: boolean;
    isOwnersLoading: boolean;
    isSubmitting: boolean;
    onAssign: () => void;
    onAssignDueAtChange: (value: string) => void;
    onAssignOwnerIdChange: (value: string) => void;
    onStartRemediation: () => void;
    ownerOptions: IssueOwnerLookup[];
}

export function AssignmentSection({
    assignDueAt,
    assignOwnerId,
    canStartRemediation,
    canWrite,
    isOwnersLoading,
    isSubmitting,
    onAssign,
    onAssignDueAtChange,
    onAssignOwnerIdChange,
    onStartRemediation,
    ownerOptions,
}: AssignmentSectionProps) {
    const { t } = useTranslation('issues');

    return (
        <section className={ISSUE_SECTION_CARD} data-testid="workflow-assignment-card">
            <div className={ISSUE_SECTION_HEADER}>
                <div>
                    <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.assignment')}</h4>
                    <p className={ISSUE_SECTION_SUBTITLE}>{t('workflow.fields.owner')} / {t('workflow.fields.due_at')}</p>
                </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <label className={ISSUE_LABEL}>{t('workflow.fields.owner')}</label>
                    <ThemedSelect
                        value={assignOwnerId}
                        onValueChange={onAssignOwnerIdChange}
                        options={ownerOptions.map((owner) => ({
                            value: String(owner.id),
                            label: `${owner.name}${owner.role_name ? ` - ${owner.role_name}` : ''}`,
                        }))}
                        allowEmpty
                        emptyLabel={
                            isOwnersLoading
                                ? t('form.placeholders.loading_owners')
                                : t('form.placeholders.select_owner')
                        }
                        placeholder={t('form.placeholders.select_owner')}
                        disabled={!canWrite || isOwnersLoading || isSubmitting}
                        className="w-full"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className={ISSUE_LABEL}>{t('workflow.fields.due_at')}</label>
                    <input
                        type="datetime-local"
                        value={assignDueAt}
                        onChange={(event) => onAssignDueAtChange(event.target.value)}
                        className={`${ISSUE_FIELD} h-10`}
                        disabled={!canWrite || isSubmitting}
                    />
                </div>
            </div>
            {canWrite && (
                <div className={ISSUE_ACTION_ROW}>
                    <button
                        type="button"
                        onClick={onAssign}
                        disabled={isSubmitting}
                        className={canStartRemediation ? ISSUE_SECONDARY_BUTTON : ISSUE_PRIMARY_BUTTON}
                    >
                        {t('actions.assign')}
                    </button>
                    {canStartRemediation && (
                        <button
                            type="button"
                            onClick={onStartRemediation}
                            disabled={isSubmitting}
                            className={ISSUE_PRIMARY_BUTTON}
                        >
                            {t('actions.start_remediation')}
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
