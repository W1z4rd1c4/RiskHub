import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Save, X } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { processApi } from '@/services/processApi';
import { threatApi } from '@/services/threatApi';
import { logError } from '@/services/logger';
import type { Threat } from '@/types/threat';

import { buildThreatWritePayload } from './threatsPagePresentation';

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

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!fields.name.trim()) {
            setError(t('form.errors.name_required'));
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

    const textAreaField = (
        field: keyof FormFields,
        label: string,
        testId: string,
    ) => (
        <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</label>
            <textarea
                data-testid={testId}
                value={fields[field]}
                rows={3}
                onChange={(event) => setField(field, event.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-600 resize-y"
            />
        </div>
    );

    return (
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
            {error ? (
                <div className="glass-card flex items-start gap-3 border border-rose-400/30 text-rose-300">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            ) : null}

            <section className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.identity')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            {t('form.name')}
                        </label>
                        <input
                            data-testid="threat-form-name"
                            value={fields.name}
                            required
                            onChange={(event) => setField('name', event.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-600"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            {t('form.category')}
                        </label>
                        <ThemedSelect
                            value={fields.category}
                            onValueChange={(value) => setField('category', value)}
                            options={categoryOptions}
                            allowEmpty
                            emptyLabel={t('form.not_set')}
                            placeholder={t('form.not_set')}
                            triggerTestId="threat-form-category"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            {t('form.relevant_subject')}
                        </label>
                        <input
                            data-testid="threat-form-relevant-subject"
                            value={fields.relevant_subject}
                            onChange={(event) => setField('relevant_subject', event.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-600"
                        />
                    </div>
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
                    <Save className="h-4 w-4" />
                    {isEdit ? t('actions.save') : t('actions.create')}
                </button>
            </div>
        </form>
    );
}
