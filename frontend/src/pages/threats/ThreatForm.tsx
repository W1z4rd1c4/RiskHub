import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Save, X } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/utils';
import { processApi } from '@/services/processApi';
import { threatApi } from '@/services/threatApi';
import { logError } from '@/services/logger';
import type { Threat } from '@/types/threat';

import { buildThreatWritePayload } from './threatsPagePresentation';

// Token-driven textarea styling matching the `Input` primitive (no `<Textarea>`
// primitive shipped in #58); the `aria-[invalid=true]` hook lets `Field` drive
// the error visual with no extra class.
const TEXTAREA_CLASS =
    'flex min-h-[4.5rem] w-full rounded-xl border border-input bg-input/40 px-4 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground hover:border-ring/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive resize-y';

interface ThreatFormProps {
    initialData?: Threat;
    isEdit?: boolean;
    onSaved: (threat: Threat) => void;
    onCancel?: () => void;
}

type FormFields = {
    name: string;
    category: string;
    description: string;
    typical_weaknesses: string;
    relevant_subject: string;
    notes: string;
};

function toFieldValue(value: string | null | undefined): string {
    return value === null || value === undefined ? '' : value;
}

function initialFields(threat?: Threat): FormFields {
    return {
        name: toFieldValue(threat?.name),
        category: toFieldValue(threat?.category),
        description: toFieldValue(threat?.description),
        typical_weaknesses: toFieldValue(threat?.typical_weaknesses),
        relevant_subject: toFieldValue(threat?.relevant_subject),
        notes: toFieldValue(threat?.notes),
    };
}

export function ThreatForm({ initialData, isEdit = false, onSaved, onCancel }: ThreatFormProps) {
    const { t } = useTranslation('threats');
    const [fields, setFields] = useState<FormFields>(() => initialFields(initialData));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormFields, string>>>({});

    // Required fields in DOM order — drives focus-first-invalid (N12).
    const REQUIRED_FIELDS: Array<keyof FormFields> = ['name'];
    const fieldRefs = useRef<Partial<Record<keyof FormFields, HTMLInputElement | null>>>({});
    const registerFieldRef = (field: keyof FormFields) => (element: HTMLInputElement | null) => {
        fieldRefs.current[field] = element;
    };

    const closedListsQuery = useQuery({
        queryKey: ictRegisterKeys.closedLists(),
        queryFn: () => processApi.getClosedLists(),
        staleTime: 5 * 60_000,
    });

    const categoryOptions = useMemo(() => {
        const lists = closedListsQuery.data ?? {};
        return (lists.KategorieHrozeb ?? []).map((value) => ({
            value: String(value),
            label: String(value),
        }));
    }, [closedListsQuery.data]);

    const setField = (field: keyof FormFields, value: string) => {
        setFields((current) => ({ ...current, [field]: value }));
    };

    const validate = (): Partial<Record<keyof FormFields, string>> => {
        const nextErrors: Partial<Record<keyof FormFields, string>> = {};
        if (!fields.name.trim()) {
            nextErrors.name = t('form.errors.name_required');
        }
        return nextErrors;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const validationErrors = validate();
        setFieldErrors(validationErrors);
        const firstInvalid = REQUIRED_FIELDS.find((field) => validationErrors[field]);
        if (firstInvalid) {
            fieldRefs.current[firstInvalid]?.focus();
            return;
        }

        const payload = buildThreatWritePayload({
            name: fields.name,
            category: fields.category,
            description: fields.description,
            typical_weaknesses: fields.typical_weaknesses,
            relevant_subject: fields.relevant_subject,
            notes: fields.notes,
        });

        try {
            setIsSubmitting(true);
            setError(null);
            const saved = isEdit && initialData
                ? await threatApi.updateThreat(initialData.id, payload)
                : await threatApi.createThreat(payload);
            onSaved(saved);
        } catch (submitError) {
            logError('Failed to save threat:', submitError);
            setError(t('form.errors.save_failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const labelClassName = 'text-xs font-bold uppercase tracking-widest text-slate-500';

    const textAreaField = (
        field: keyof FormFields,
        label: string,
        testId: string,
    ) => (
        <Field label={label} error={fieldErrors[field]} labelClassName={labelClassName}>
            {(control) => (
                <textarea
                    {...control}
                    data-testid={testId}
                    value={fields[field]}
                    rows={3}
                    onChange={(event) => setField(field, event.target.value)}
                    className={TEXTAREA_CLASS}
                />
            )}
        </Field>
    );

    const hasFieldErrors = Object.keys(fieldErrors).length > 0;

    return (
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
            {error || hasFieldErrors ? (
                <div role="alert" className="glass-card flex items-start gap-3 border border-rose-400/30 text-rose-300">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{error ?? t('form.errors.fix_fields')}</p>
                </div>
            ) : null}

            {closedListsQuery.isError ? (
                <div
                    role="status"
                    className="glass-card flex items-center justify-between gap-3 border border-amber-400/30 text-amber-200"
                >
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <p className="text-sm font-medium">{t('form.errors.lists_failed')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void closedListsQuery.refetch()}
                        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-100 transition-colors hover:bg-white/10"
                    >
                        {t('actions.retry')}
                    </button>
                </div>
            ) : null}

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.identity')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Field label={t('form.name')} required error={fieldErrors.name} labelClassName={labelClassName}>
                        {(control) => (
                            <Input
                                {...control}
                                ref={registerFieldRef('name')}
                                data-testid="threat-form-name"
                                value={fields.name}
                                required
                                onChange={(event) => setField('name', event.target.value)}
                            />
                        )}
                    </Field>
                    <Field label={t('form.category')} labelClassName={labelClassName}>
                        {(control) => (
                            <ThemedSelect
                                {...control}
                                value={fields.category}
                                onValueChange={(value) => setField('category', value)}
                                options={categoryOptions}
                                allowEmpty
                                emptyLabel={t('form.not_set')}
                                placeholder={t('form.not_set')}
                                triggerTestId="threat-form-category"
                            />
                        )}
                    </Field>
                    <Field label={t('form.relevant_subject')} labelClassName={labelClassName}>
                        {(control) => (
                            <Input
                                {...control}
                                data-testid="threat-form-relevant-subject"
                                value={fields.relevant_subject}
                                onChange={(event) => setField('relevant_subject', event.target.value)}
                            />
                        )}
                    </Field>
                </div>
            </section>

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.details')}
                </h2>
                <div className="grid grid-cols-1 gap-5">
                    {textAreaField('description', t('form.description'), 'threat-form-description')}
                    {textAreaField('typical_weaknesses', t('form.typical_weaknesses'), 'threat-form-typical-weaknesses')}
                    {textAreaField('notes', t('form.notes'), 'threat-form-notes')}
                </div>
            </section>

            <div className="flex items-center justify-end gap-3">
                {onCancel ? (
                    <button
                        type="button"
                        onClick={onCancel}
                        data-testid="threat-form-cancel"
                        className="px-5 py-2.5 glass rounded-xl text-slate-300 hover:text-white transition-colors text-sm font-semibold flex items-center gap-2"
                    >
                        <X className="h-4 w-4" />
                        {t('actions.cancel')}
                    </button>
                ) : null}
                <button
                    type="submit"
                    disabled={isSubmitting}
                    data-testid="threat-form-submit"
                    className="px-5 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center gap-2 text-sm"
                >
                    <Save className={cn('h-4 w-4', isSubmitting && 'animate-pulse')} />
                    {isEdit ? t('actions.save') : t('actions.create')}
                </button>
            </div>
        </form>
    );
}
