import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, PlusCircle, X } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { issuesApi } from '@/services/issuesApi';
import { apiClient } from '@/services/apiClient';
import type { Issue, IssueContextEntityType, IssueSeverity } from '@/types/issue';
import { ISSUE_FIELD, ISSUE_LABEL, ISSUE_TEXTAREA } from './issueUi';
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

    const [title, setTitle] = useState('');
    const [severity, setSeverity] = useState<IssueSeverity>('medium');
    const [dueAt, setDueAt] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);

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
        setTitle(seedTitle);
        setSeverity('medium');
        setDueAt(toDateTimeLocalInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
        setDescription('');
        setErrorKey(null);
        setIsSubmitting(false);
    }, [contextEntityLabel, defaultTitlePrefix, isOpen, t]);

    if (!isOpen) {
        return null;
    }

    const handleSubmit = async () => {
        if (!title.trim()) {
            setErrorKey('errors.title_required');
            return;
        }

        setIsSubmitting(true);
        setErrorKey(null);
        try {
            const created = await issuesApi.createContextual({
                entity_type: contextEntityType,
                entity_id: contextEntityId,
                title: title.trim(),
                description: description.trim() || undefined,
                severity,
                due_at: fromDateTimeLocalInputValue(dueAt),
            });
            onCreated(created);
            onClose();
        } catch (createError) {
            setErrorKey(apiClient.toUiMessageKey(createError));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <button
                type="button"
                className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
                onClick={onClose}
                aria-label={t('quick_create.close')}
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="issue-quick-create-title"
                className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl space-y-5"
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <h3 id="issue-quick-create-title" className="text-xl font-black text-white tracking-tight">
                            {t('quick_create.title')}
                        </h3>
                        <p className="text-sm text-slate-400">
                            {t('quick_create.context_label')}: <span className="text-slate-200">{contextEntityLabel}</span>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                        aria-label={t('quick_create.close')}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {errorKey && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5" />
                        <span>
                            {errorKey.startsWith('errorKeys.')
                                ? t(errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                                : t(errorKey)}
                        </span>
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5 md:col-span-2">
                        <label className={ISSUE_LABEL}>{t('form.fields.title')}</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            className={ISSUE_FIELD}
                            placeholder={t('form.placeholders.title')}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className={ISSUE_LABEL}>{t('form.fields.severity')}</label>
                        <ThemedSelect
                            value={severity}
                            onValueChange={(value) => setSeverity(value as IssueSeverity)}
                            options={severityOptions}
                            className="w-full"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className={ISSUE_LABEL}>{t('form.fields.due_date')}</label>
                        <input
                            type="datetime-local"
                            value={dueAt}
                            onChange={(event) => setDueAt(event.target.value)}
                            className={`${ISSUE_FIELD} h-10`}
                        />
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                        <label className={ISSUE_LABEL}>{t('form.fields.description')}</label>
                        <textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            className={ISSUE_TEXTAREA}
                            placeholder={t('quick_create.description_placeholder')}>
                        </textarea>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                        disabled={isSubmitting}
                    >
                        {t('actions.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    >
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                        {isSubmitting
                            ? t('quick_create.creating')
                            : t('quick_create.submit')}
                    </button>
                </div>
            </div>
        </div>
    );
}
