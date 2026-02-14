import { useEffect, useState } from 'react';
import { PlusCircle, X } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { cn } from '@/lib/utils';
import { issuesApi } from '@/services/issuesApi';
import { apiClient } from '@/services/apiClient';
import type {
    Issue,
    IssueCreatePayload,
    IssueDepartmentLookup,
    IssueOwnerLookup,
    IssueSeverity,
} from '@/types/issue';
import { ISSUE_FIELD, ISSUE_LABEL, ISSUE_TEXTAREA } from './issueUi';

interface IssueCreateFormProps {
    onCreated: (issue: Issue) => void;
    className?: string;
    onCancel?: () => void;
}

export function IssueCreateForm({ onCreated, className, onCancel }: IssueCreateFormProps) {
    const { t } = useTranslation('issues');

    const severityOptions: Array<{ label: string; value: IssueSeverity }> = [
        { label: t('severity.low'), value: 'low' },
        { label: t('severity.medium'), value: 'medium' },
        { label: t('severity.high'), value: 'high' },
        { label: t('severity.critical'), value: 'critical' },
    ];

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [departmentId, setDepartmentId] = useState('');
    const [ownerId, setOwnerId] = useState('');
    const [severity, setSeverity] = useState<IssueSeverity>('medium');
    const [dueAt, setDueAt] = useState('');

    const [departmentOptions, setDepartmentOptions] = useState<IssueDepartmentLookup[]>([]);
    const [ownerOptions, setOwnerOptions] = useState<IssueOwnerLookup[]>([]);
    const [isOwnersLoading, setIsOwnersLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        issuesApi
            .listDepartments()
            .then((departments) => {
                if (cancelled) {
                    return;
                }
                setDepartmentOptions(departments);
            })
            .catch(() => {
                if (cancelled) {
                    return;
                }
                setErrorKey('errors.load_departments_failed');
            });
        return () => {
            cancelled = true;
        };
    }, [t]);

    useEffect(() => {
        if (!departmentId) {
            setOwnerOptions([]);
            setOwnerId('');
            setIsOwnersLoading(false);
            return;
        }
        const parsedDepartmentId = Number(departmentId);
        if (!Number.isFinite(parsedDepartmentId) || parsedDepartmentId <= 0) {
            setOwnerOptions([]);
            setOwnerId('');
            setIsOwnersLoading(false);
            return;
        }

        let cancelled = false;
        setIsOwnersLoading(true);
        issuesApi
            .listAssignableOwners(parsedDepartmentId)
            .then((owners) => {
                if (cancelled) {
                    return;
                }
                setOwnerOptions(owners);
                setOwnerId((previous) => (owners.some((owner) => String(owner.id) === previous) ? previous : ''));
            })
            .catch(() => {
                if (cancelled) {
                    return;
                }
                setOwnerOptions([]);
                setOwnerId('');
                setErrorKey('errors.load_owners_failed');
            })
            .finally(() => {
                if (!cancelled) {
                    setIsOwnersLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [departmentId, t]);

    const handleCreateIssue = async () => {
        if (!title.trim()) {
            setErrorKey('errors.title_required');
            return;
        }
        const parsedDepartmentId = Number(departmentId);
        if (!Number.isFinite(parsedDepartmentId) || parsedDepartmentId <= 0) {
            setErrorKey('errors.department_required');
            return;
        }

        const payload: IssueCreatePayload = {
            title: title.trim(),
            description: description.trim() || undefined,
            severity,
            source_type: 'manual',
            department_id: parsedDepartmentId,
            owner_user_id: ownerId ? Number(ownerId) : undefined,
            due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
        };

        setIsCreating(true);
        setErrorKey(null);
        try {
            const created = await issuesApi.create(payload);
            onCreated(created);
        } catch (createError) {
            setErrorKey(apiClient.toUiMessageKey(createError));
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <section className={cn('space-y-6', className)}>
            {errorKey && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {errorKey.startsWith('errorKeys.')
                        ? t(errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                        : t(errorKey)}
                </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                    <label className={ISSUE_LABEL}>{t('form.fields.title')}</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder={t('form.placeholders.title')}
                        className={ISSUE_FIELD}
                    />
                </div>

                <div className="space-y-1.5">
                    <label className={ISSUE_LABEL}>{t('form.fields.severity')}</label>
                    <ThemedSelect
                        value={severity}
                        onValueChange={(value) => setSeverity(value as IssueSeverity)}
                        options={severityOptions.map((option) => ({ label: option.label, value: option.value }))}
                        className="w-full"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className={ISSUE_LABEL}>{t('form.fields.department')}</label>
                    <ThemedSelect
                        value={departmentId}
                        onValueChange={setDepartmentId}
                        options={departmentOptions.map((department) => ({
                            value: String(department.id),
                            label: `${department.name} (${department.code})`,
                        }))}
                        allowEmpty
                        emptyLabel={t('form.placeholders.department')}
                        placeholder={t('form.placeholders.department')}
                        className="w-full"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className={ISSUE_LABEL}>{t('form.fields.owner')}</label>
                    <ThemedSelect
                        value={ownerId}
                        onValueChange={setOwnerId}
                        options={ownerOptions.map((owner) => ({
                            value: String(owner.id),
                            label: `${owner.name}${owner.role_name ? ` - ${owner.role_name}` : ''}`,
                        }))}
                        allowEmpty
                        emptyLabel={
                            !departmentId
                                ? t('form.placeholders.select_department_first')
                                : isOwnersLoading
                                    ? t('form.placeholders.loading_owners')
                                    : t('fallbacks.unassigned')
                        }
                        placeholder={t('form.placeholders.owner')}
                        disabled={!departmentId || isOwnersLoading}
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
                        placeholder={t('form.placeholders.description')}
                        className={ISSUE_TEXTAREA}
                    />
                </div>
            </div>

            <div className="mt-10 flex items-center justify-between border-t border-white/5 pt-6">
                {onCancel ? (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
                    >
                        <X className="h-4 w-4" />
                        {t('actions.cancel')}
                    </button>
                ) : (
                    <span />
                )}

                <button
                    type="button"
                    onClick={handleCreateIssue}
                    disabled={isCreating}
                    className="btn-primary px-6"
                >
                    <span className="inline-flex items-center gap-2">
                        <PlusCircle className="h-4 w-4" />
                        {isCreating ? t('actions.creating') : t('actions.create_issue')}
                    </span>
                </button>
            </div>
        </section>
    );
}
