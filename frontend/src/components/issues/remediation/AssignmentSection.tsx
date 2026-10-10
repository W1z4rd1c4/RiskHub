import { Button } from '@/components/ui/button';
import { Card, CardFooter, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { getRoleLabel } from '@/lib/roleLabels';
import type { IssueOwnerLookup } from '@/types/issue';

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
        <Card as="section" className="space-y-5" data-testid="workflow-assignment-card">
            <CardHeader
                title={t('workflow.sections.assignment')}
                description={t('workflow.sections.assignment_description')}
            />
            <div className="grid gap-4 md:grid-cols-2">
                <Field label={t('workflow.fields.owner')}>
                    {(field) => (
                        <ThemedSelect
                            {...field}
                            value={assignOwnerId}
                            onValueChange={onAssignOwnerIdChange}
                            options={ownerOptions.map((owner) => ({
                                value: String(owner.id),
                                label: owner.role_name
                                    ? t('form.owner_option', { name: owner.name, role: getRoleLabel(owner.role_name, t) })
                                    : owner.name,
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
                    )}
                </Field>
                <Field label={t('workflow.fields.due_at')}>
                    {(field) => (
                        <Input
                            {...field}
                            type="datetime-local"
                            value={assignDueAt}
                            onChange={(event) => onAssignDueAtChange(event.target.value)}
                            disabled={!canWrite || isSubmitting}
                        />
                    )}
                </Field>
            </div>
            {canWrite && (
                <CardFooter className="justify-start">
                    <Button
                        variant={canStartRemediation ? 'secondary' : 'accent'}
                        onClick={onAssign}
                        disabled={isSubmitting}
                    >
                        {t('actions.assign')}
                    </Button>
                    {canStartRemediation && (
                        <Button variant="accent" onClick={onStartRemediation} disabled={isSubmitting}>
                            {t('actions.start_remediation')}
                        </Button>
                    )}
                </CardFooter>
            )}
        </Card>
    );
}
