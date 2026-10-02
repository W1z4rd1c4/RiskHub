import { useEffect, useId, useState } from 'react';
import { PlusCircle, X } from 'lucide-react';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { getRoleLabel } from '@/lib/roleLabels';
import { cn } from '@/lib/utils';
import { issuesApi } from '@/services/issuesApi';
import { apiClient } from '@/services/apiClient';
import { useDirtyTaskGuard } from '@/hooks/useDirtyTaskGuard';
import type {
    Issue,
    IssueCreatePayload,
    IssueDepartmentLookup,
    IssueOwnerLookup,
    IssueSeverity,
} from '@/types/issue';

type IssueCreateFieldErrors = Partial<Record<'title' | 'department_id', string>>;

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
    // AX-04: validation errors sit on their field; `errorKey` is for load/server errors only.
    const [fieldErrors, setFieldErrors] = useState<IssueCreateFieldErrors>({});
    const titleId = useId();
    const departmentFieldId = useId();
    const {
        acceptCurrentSnapshot,
        confirmationDialog,
    } = useDirtyTaskGuard({
        busy: isCreating,
        currentSnapshot: JSON.stringify([
            title,
            description,
            departmentId,
            ownerId,
            severity,
            dueAt,
        ]),
    });

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

    const handleCreateIssue = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isCreating) return;
        const parsedDepartmentId = Number(departmentId);
        const nextFieldErrors: IssueCreateFieldErrors = {
            ...(!title.trim() ? { title: t('errors.title_required') } : {}),
            ...(!Number.isFinite(parsedDepartmentId) || parsedDepartmentId <= 0
                ? { department_id: t('errors.department_required') }
                : {}),
        };
        setFieldErrors(nextFieldErrors);
        if (Object.keys(nextFieldErrors).length > 0) {
            const firstInvalid = nextFieldErrors.title ? titleId : departmentFieldId;
            document.getElementById(firstInvalid)?.focus();
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
            acceptCurrentSnapshot();
            onCreated(created);
        } catch (createError) {
            setErrorKey(apiClient.toUiMessageKey(createError));
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <form className={cn('space-y-6', className)} onSubmit={(event) => void handleCreateIssue(event)} noValidate>
            {errorKey && (
                <InlineMessage tone="danger">
                    {translateUiMessage(t, errorKey)}
                </InlineMessage>
            )}

            <fieldset disabled={isCreating} className="grid min-w-0 gap-5 md:grid-cols-2">
                <Field id={titleId} label={t('form.fields.title')} required error={fieldErrors.title} className="md:col-span-2">
                    {(field) => (
                        <Input
                            {...field}
                            type="text"
                            value={title}
                            onChange={(event) => {
                                setTitle(event.target.value);
                                setFieldErrors((current) => ({ ...current, title: undefined }));
                            }}
                            placeholder={t('form.placeholders.title')}
                            data-testid="issue-create-title"
                        />
                    )}
                </Field>

                <Field label={t('form.fields.severity')}>
                    {(field) => (
                        <ThemedSelect
                            {...field}
                            value={severity}
                            onValueChange={(value) => setSeverity(value as IssueSeverity)}
                            options={severityOptions.map((option) => ({ label: option.label, value: option.value }))}
                            className="w-full"
                        />
                    )}
                </Field>

                <Field id={departmentFieldId} label={t('form.fields.department')} required error={fieldErrors.department_id}>
                    {(field) => (
                        <ThemedSelect
                            {...field}
                            value={departmentId}
                            onValueChange={(value) => {
                                setDepartmentId(value);
                                setFieldErrors((current) => ({ ...current, department_id: undefined }));
                            }}
                            options={departmentOptions.map((department) => ({
                                value: String(department.id),
                                label: `${department.name} (${department.code})`,
                            }))}
                            allowEmpty
                            emptyLabel={t('form.placeholders.department')}
                            placeholder={t('form.placeholders.department')}
                            className="w-full"
                        />
                    )}
                </Field>

                <Field label={t('form.fields.owner')}>
                    {(field) => (
                        <ThemedSelect
                            {...field}
                            value={ownerId}
                            onValueChange={setOwnerId}
                            options={ownerOptions.map((owner) => ({
                                value: String(owner.id),
                                label: owner.role_name
                                    ? t('form.owner_option', { name: owner.name, role: getRoleLabel(owner.role_name, t) })
                                    : owner.name,
                            }))}
                            allowEmpty
                            emptyLabel={
                                !departmentId
                                    ? t('form.placeholders.select_department_first')
                                    : isOwnersLoading
                                        ? t('form.placeholders.loading_owners')
                                        : t('common:fallbacks.unassigned')
                            }
                            placeholder={t('form.placeholders.owner')}
                            disabled={!departmentId || isOwnersLoading}
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
                            onChange={(event) => setDueAt(event.target.value)}
                        />
                    )}
                </Field>

                <Field label={t('form.fields.description')} className="md:col-span-2">
                    {(field) => (
                        <Textarea
                            {...field}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder={t('form.placeholders.description')}
                        />
                    )}
                </Field>
            </fieldset>

            <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
                {onCancel ? (
                    <Button variant="secondary" onClick={onCancel} disabled={isCreating}>
                        <X aria-hidden="true" />
                        {t('actions.cancel')}
                    </Button>
                ) : (
                    <span />
                )}

                <Button type="submit" variant="accent" isLoading={isCreating} data-testid="issue-create-submit">
                    {!isCreating ? <PlusCircle aria-hidden="true" /> : null}
                    {isCreating ? t('actions.creating') : t('actions.create_issue')}
                </Button>
            </div>
            {confirmationDialog}
        </form>
    );
}
