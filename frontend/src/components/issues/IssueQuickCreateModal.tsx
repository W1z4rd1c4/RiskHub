import { useEffect, useId, useMemo, useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { issuesApi } from '@/services/issuesApi';
import { apiClient } from '@/services/apiClient';
import { useDirtyTaskGuard } from '@/hooks/useDirtyTaskGuard';
import type { Issue, IssueContextEntityType, IssueSeverity } from '@/types/issue';
import { fromDateTimeLocalInputValue, toDateTimeLocalInputValue } from '@/utils/dateTimeLocal';

interface IssueQuickCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    contextEntityType: IssueContextEntityType;
    contextEntityId: number;
    contextEntityLabel: string;
    defaultTitlePrefix?: string;
    onCreated: (issue: Issue) => void;
}

function createQuickIssueSnapshot(
    title: string,
    severity: IssueSeverity,
    dueAt: string,
    description: string,
): string {
    return JSON.stringify([title, severity, dueAt, description]);
}

export function IssueQuickCreateModal({
    isOpen,
    onClose,
    contextEntityType,
    contextEntityId,
    contextEntityLabel,
    defaultTitlePrefix,
    onCreated,
}: IssueQuickCreateModalProps) {
    const { t } = useTranslation('issues');
    const titleId = useId();

    const [title, setTitle] = useState('');
    const [severity, setSeverity] = useState<IssueSeverity>('medium');
    const [dueAt, setDueAt] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const currentSnapshot = createQuickIssueSnapshot(title, severity, dueAt, description);
    const {
        acceptCurrentSnapshot,
        confirmationDialog,
        requestLocalLeave,
    } = useDirtyTaskGuard({
        busy: isSubmitting,
        currentSnapshot,
        enabled: isOpen,
    });
    const severityOptions = useMemo(
        () => [
            { value: 'low', label: t('severity.low') },
            { value: 'medium', label: t('severity.medium') },
            { value: 'high', label: t('severity.high') },
            { value: 'critical', label: t('severity.critical') },
        ],
        [t]
    );

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const seedTitle = defaultTitlePrefix
            ? `${defaultTitlePrefix}: ${contextEntityLabel}`
            : `${t('quick_create.default_title_prefix')}: ${contextEntityLabel}`;
        const seedDueAt = toDateTimeLocalInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        acceptCurrentSnapshot(createQuickIssueSnapshot(seedTitle, 'medium', seedDueAt, ''));
        setTitle(seedTitle);
        setSeverity('medium');
        setDueAt(seedDueAt);
        setDescription('');
        setErrorKey(null);
        setIsSubmitting(false);
    }, [acceptCurrentSnapshot, contextEntityLabel, defaultTitlePrefix, isOpen, t]);

    const handleSubmit = async () => {
        if (!title.trim()) {
            setErrorKey('errors.title_required');
            return;
        }

        setIsSubmitting(true);
        setErrorKey(null);
        const submittedSnapshot = currentSnapshot;
        try {
            const created = await issuesApi.createContextual({
                entity_type: contextEntityType,
                entity_id: contextEntityId,
                title: title.trim(),
                description: description.trim() || undefined,
                severity,
                due_at: fromDateTimeLocalInputValue(dueAt),
            });
            acceptCurrentSnapshot(submittedSnapshot);
            onCreated(created);
            onClose();
        } catch (createError) {
            setErrorKey(apiClient.toUiMessageKey(createError));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <DialogShell
            isOpen={isOpen}
            onClose={onClose}
            isBusy={isSubmitting}
            dirtyGuard={{ requestLocalLeave, confirmationDialog }}
            titleId={titleId}
            size="lg"
        >
            <DialogHeader
                title={t('quick_create.title')}
                closeLabel={t('quick_create.close')}
                description={(
                    <>
                        {t('quick_create.context_label')}: <span className="text-foreground">{contextEntityLabel}</span>
                    </>
                )}
            />
            <DialogBody>
                {errorKey && (
                    <InlineMessage tone="danger">
                        {errorKey.startsWith('errorKeys.')
                            ? t(errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                            : t(errorKey)}
                    </InlineMessage>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                    <Field label={t('form.fields.title')} className="md:col-span-2">
                        {(field) => (
                            <Input
                                {...field}
                                type="text"
                                value={title}
                                disabled={isSubmitting}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder={t('form.placeholders.title')}
                            />
                        )}
                    </Field>

                    <Field label={t('form.fields.severity')}>
                        {(field) => (
                            <ThemedSelect
                                {...field}
                                value={severity}
                                disabled={isSubmitting}
                                onValueChange={(value) => setSeverity(value as IssueSeverity)}
                                options={severityOptions}
                                className="w-full"
                            />
                        )}
                    </Field>

                    <Field label={t('form.fields.due_date')}>
                        {(field) => (
                            <Input
                                {...field}
                                type="datetime-local"
                                value={dueAt}
                                disabled={isSubmitting}
                                onChange={(event) => setDueAt(event.target.value)}
                            />
                        )}
                    </Field>

                    <Field label={t('form.fields.description')} className="md:col-span-2">
                        {(field) => (
                            <Textarea
                                {...field}
                                rows={4}
                                value={description}
                                disabled={isSubmitting}
                                onChange={(event) => setDescription(event.target.value)}
                                placeholder={t('quick_create.description_placeholder')}
                            />
                        )}
                    </Field>
                </div>
            </DialogBody>
            <DialogFooter
                cancelLabel={t('actions.cancel')}
                submitLabel={isSubmitting ? t('quick_create.creating') : t('quick_create.submit')}
                submitIcon={<PlusCircle aria-hidden="true" />}
                onSubmit={() => void handleSubmit()}
            />
        </DialogShell>
    );
}
