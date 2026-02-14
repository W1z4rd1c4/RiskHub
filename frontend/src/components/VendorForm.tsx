import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { Save, X, AlertCircle } from 'lucide-react';
import { vendorApi } from '@/services/vendorApi';
import { lookupApi } from '@/services/lookupApi';
import type { UserLookupItem } from '@/services/lookupApi';
import type { Vendor, VendorCreate, VendorUpdate, VendorType, VendorStatus, VendorReplaceability } from '@/types/vendor';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import { IMPACT_DESCRIPTIONS, formatFinancialRange } from '@/constants/riskScoreDescriptions';
import { cn } from '@/lib/utils';

interface DepartmentLookup {
    id: number;
    name: string;
    code?: string;
}

interface VendorFormProps {
    initialData?: Vendor;
    isEdit?: boolean;
    onSaved: (vendor: Vendor) => void;
    onCancel?: () => void;
}

const vendorTypeOptions: { value: VendorType; labelKey: string }[] = [
    { value: 'ict', labelKey: 'form.vendor_type.ict' },
    { value: 'outsourcing', labelKey: 'form.vendor_type.outsourcing' },
    { value: 'professional_services', labelKey: 'form.vendor_type.professional_services' },
    { value: 'partner', labelKey: 'form.vendor_type.partner' },
    { value: 'other', labelKey: 'form.vendor_type.other' },
];

const replaceabilityOptions: { value: VendorReplaceability; labelKey: string }[] = [
    { value: 'easy', labelKey: 'form.replaceability.easy' },
    { value: 'medium', labelKey: 'form.replaceability.medium' },
    { value: 'hard', labelKey: 'form.replaceability.hard' },
];

function scoreColor(score: number): string {
    if (score >= 5) return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
    if (score >= 4) return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
    if (score >= 3) return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    if (score >= 2) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
}

export function VendorForm({ initialData, isEdit = false, onSaved, onCancel }: VendorFormProps) {
    const { t } = useTranslation('vendors');
    const { totalAssets } = useTotalAssetsValue();

    type VendorFlagKey =
        | 'supports_important_core_insurance_function'
        | 'dora_relevant'
        | 'is_significant_vendor'
        | 'has_alternative_providers';

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [users, setUsers] = useState<UserLookupItem[]>([]);
    const [departments, setDepartments] = useState<DepartmentLookup[]>([]);
    const [existingProcesses, setExistingProcesses] = useState<string[]>([]);
    const [subprocessesByProcess, setSubprocessesByProcess] = useState<Record<string, string[]>>({});

    const [formData, setFormData] = useState<Partial<Vendor>>(() => ({
        name: '',
        legal_name: '',
        registration_id: '',
        country: '',
        website: '',
        description: '',
        process: '',
        subprocess: '',
        department_id: null,
        outsourcing_owner_user_id: 0,
        vendor_type: 'other',
        risk_score_1_5: 3,
        supports_important_core_insurance_function: false,
        dora_relevant: false,
        is_significant_vendor: false,
        materiality_assessed_max_impact_pct_own_funds: null,
        replaceability: null,
        has_alternative_providers: false,
        status: 'active',
        ...initialData,
    }));

    const ownerOptions = useMemo(() => {
        return users.map((u) => ({
            value: String(u.id),
            label: u.department_name ? `${u.name} — ${u.department_name}` : u.name,
        }));
    }, [users]);

    const departmentOptions = useMemo(() => {
        return departments.map((d) => ({
            value: String(d.id),
            label: d.code ? `${d.name} (${d.code})` : d.name,
        }));
    }, [departments]);

    useEffect(() => {
        const loadLookups = async () => {
            try {
                const [userData, deptData, vendorData] = await Promise.all([
                    lookupApi.getUsers(),
                    lookupApi.getDepartments(),
                    vendorApi.getVendors({ skip: 0, limit: 100 }),
                ]);
                setUsers(userData);
                setDepartments(deptData);

                const processes = [...new Set(vendorData.items.map((v) => v.process).filter(Boolean))];
                setExistingProcesses(processes);

                const subprocMap: Record<string, string[]> = {};
                vendorData.items.forEach((v) => {
                    if (v.process && v.subprocess) {
                        if (!subprocMap[v.process]) subprocMap[v.process] = [];
                        if (!subprocMap[v.process].includes(v.subprocess)) subprocMap[v.process].push(v.subprocess);
                    }
                });
                setSubprocessesByProcess(subprocMap);
            } catch (err) {
                console.error('Failed to load vendor lookups:', err);
            }
        };
        loadLookups();
    }, []);

    const handleChange = (field: keyof Vendor, value: unknown) => {
        setFormData((prev) => {
            const next = { ...prev, [field]: value };

            if (field === 'outsourcing_owner_user_id') {
                const owner = users.find((u) => u.id === value);
                if (owner?.department_id && !next.department_id) {
                    next.department_id = owner.department_id;
                }
            }

            return next;
        });
    };

    const validate = (): boolean => {
        if (!formData.name?.trim()) {
            setError(t('errors.name_required'));
            return false;
        }
        if (!formData.process?.trim()) {
            setError(t('errors.process_required'));
            return false;
        }
        if (!formData.department_id) {
            setError(t('errors.department_required'));
            return false;
        }
        if (!formData.outsourcing_owner_user_id) {
            setError(t('errors.owner_required'));
            return false;
        }
        if (!formData.risk_score_1_5 || formData.risk_score_1_5 < 1 || formData.risk_score_1_5 > 5) {
            setError(t('errors.score_required'));
            return false;
        }
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!validate()) return;

        try {
            setIsSubmitting(true);

            const payloadBase = {
                name: formData.name?.trim() || '',
                legal_name: formData.legal_name?.trim() || null,
                registration_id: formData.registration_id?.trim() || null,
                country: formData.country?.trim() || null,
                website: formData.website?.trim() || null,
                description: formData.description?.trim() || null,
                process: formData.process?.trim() || '',
                subprocess: formData.subprocess?.trim() || null,
                department_id: formData.department_id ?? null,
                outsourcing_owner_user_id: formData.outsourcing_owner_user_id || 0,
                vendor_type: (formData.vendor_type || 'other') as VendorType,
                risk_score_1_5: formData.risk_score_1_5 || 3,
                supports_important_core_insurance_function: !!formData.supports_important_core_insurance_function,
                dora_relevant: !!formData.dora_relevant,
                is_significant_vendor: !!formData.is_significant_vendor,
                materiality_assessed_max_impact_pct_own_funds: formData.materiality_assessed_max_impact_pct_own_funds ?? null,
                replaceability: (formData.replaceability || null) as VendorReplaceability | null,
                has_alternative_providers: !!formData.has_alternative_providers,
                status: (formData.status || 'active') as VendorStatus,
            };

            const saved = isEdit && initialData
                ? await vendorApi.updateVendor(initialData.id, payloadBase as VendorUpdate)
                : await vendorApi.createVendor(payloadBase as VendorCreate);

            onSaved(saved);
        } catch (err) {
            console.error('Failed to save vendor:', err);
            setError(t('errors.save_failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const score = formData.risk_score_1_5 || 3;
    const impact = IMPACT_DESCRIPTIONS[score as 1 | 2 | 3 | 4 | 5];
    const financialRange = formatFinancialRange(score, totalAssets, t('form.financial.no_loss'));

    const processSuggestions = existingProcesses.filter((p) => p.toLowerCase().includes((formData.process || '').toLowerCase()));
    const subprocessSuggestions = (subprocessesByProcess[formData.process || ''] || []).filter((p) =>
        p.toLowerCase().includes((formData.subprocess || '').toLowerCase())
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
                <div className="p-4 rounded-xl border flex items-start gap-3 bg-rose-500/10 border-rose-500/20 text-rose-400">
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            <section className="glass-card p-6 space-y-5">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('form.sections.identity')}</h3>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.name')}</label>
                        <input
                            value={formData.name || ''}
                            onChange={(e) => handleChange('name', e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-accent/50"
                            placeholder={t('form.name_placeholder')}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.vendor_type.label')}</label>
                        <ThemedSelect
                            value={(formData.vendor_type || 'other') as string}
                            onValueChange={(v) => handleChange('vendor_type', v)}
                            options={vendorTypeOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.legal_name')}</label>
                        <input
                            value={formData.legal_name || ''}
                            onChange={(e) => handleChange('legal_name', e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-accent/50"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.registration_id')}</label>
                        <input
                            value={formData.registration_id || ''}
                            onChange={(e) => handleChange('registration_id', e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-accent/50"
                        />
                    </div>
                </div>
            </section>

            <section className="glass-card p-6 space-y-5">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('form.sections.ownership')}</h3>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.department')}</label>
                        <ThemedSelect
                            value={formData.department_id ? String(formData.department_id) : ''}
                            onValueChange={(v) => handleChange('department_id', v ? Number(v) : null)}
                            placeholder={t('form.department_placeholder')}
                            allowEmpty
                            emptyLabel={t('form.department_placeholder')}
                            options={departmentOptions}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.owner')}</label>
                        <ThemedSelect
                            value={formData.outsourcing_owner_user_id ? String(formData.outsourcing_owner_user_id) : ''}
                            onValueChange={(v) => handleChange('outsourcing_owner_user_id', v ? Number(v) : 0)}
                            placeholder={t('form.owner_placeholder')}
                            allowEmpty
                            emptyLabel={t('form.owner_placeholder')}
                            options={ownerOptions}
                        />
                    </div>

                    <div className="space-y-1.5 relative">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.process')}</label>
                        <input
                            value={formData.process || ''}
                            onChange={(e) => handleChange('process', e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-accent/50"
                            placeholder={t('form.process_placeholder')}
                        />
                        {processSuggestions.length > 0 && (formData.process || '').length > 0 && (
                            <div className="absolute mt-1 w-full z-10 bg-slate-900/95 border border-white/10 rounded-xl overflow-hidden">
                                {processSuggestions.slice(0, 6).map((p) => (
                                    <button
                                        type="button"
                                        key={p}
                                        onClick={() => handleChange('process', p)}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5 relative">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.subprocess')}</label>
                        <input
                            value={formData.subprocess || ''}
                            onChange={(e) => handleChange('subprocess', e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-accent/50"
                            placeholder={t('form.subprocess_placeholder')}
                        />
                        {subprocessSuggestions.length > 0 && (formData.subprocess || '').length > 0 && (
                            <div className="absolute mt-1 w-full z-10 bg-slate-900/95 border border-white/10 rounded-xl overflow-hidden">
                                {subprocessSuggestions.slice(0, 6).map((p) => (
                                    <button
                                        type="button"
                                        key={p}
                                        onClick={() => handleChange('subprocess', p)}
                                        className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <section className="glass-card p-6 space-y-5">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('form.sections.classification')}</h3>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.risk_score')}</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min={1}
                                max={5}
                                value={score}
                                onChange={(e) => handleChange('risk_score_1_5', Number(e.target.value))}
                                className={cn('w-full', score >= 5 ? 'accent-rose-500' : score >= 4 ? 'accent-orange-500' : score >= 3 ? 'accent-amber-500' : score >= 2 ? 'accent-blue-500' : 'accent-emerald-500')}
                            />
                            <div className={cn('px-2.5 py-1 rounded-full text-[10px] font-black border whitespace-nowrap', scoreColor(score))}>
                                {score} / 5
                            </div>
                        </div>
                        <p className="text-xs text-slate-400">
                            <span className="font-semibold text-slate-200">{impact ? t(impact.labelKey, impact.labelKey) : ''}</span>
                            {financialRange ? ` • ${financialRange}` : null}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.status')}</label>
                        <ThemedSelect
                            value={(formData.status || 'active') as string}
                            onValueChange={(v) => handleChange('status', v)}
                            options={[
                                { value: 'active', label: t('status.active') },
                                { value: 'inactive', label: t('status.inactive') },
                            ]}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.replaceability.label')}</label>
                        <ThemedSelect
                            value={formData.replaceability ? String(formData.replaceability) : ''}
                            onValueChange={(v) => handleChange('replaceability', v || null)}
                            placeholder={t('form.replaceability.placeholder')}
                            allowEmpty
                            emptyLabel={t('form.replaceability.placeholder')}
                            options={replaceabilityOptions.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.flags')}</label>
                        <div className="space-y-2">
                            {[
                                { key: 'supports_important_core_insurance_function' as const, label: t('flags.supports_core_function') },
                                { key: 'dora_relevant' as const, label: t('flags.dora_relevant') },
                                { key: 'is_significant_vendor' as const, label: t('flags.significant_vendor') },
                                { key: 'has_alternative_providers' as const, label: t('flags.has_alternatives') },
                            ].map(({ key, label }: { key: VendorFlagKey; label: string }) => (
                                <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
                                    <input
                                        type="checkbox"
                                        checked={!!formData[key]}
                                        onChange={(e) => handleChange(key as keyof Vendor, e.target.checked)}
                                        className="accent-accent"
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <div className="flex items-center justify-end gap-3">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors flex items-center gap-2"
                    >
                        <X className="h-4 w-4" />
                        {t('actions.cancel')}
                    </button>
                )}
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className={cn(
                        "px-4 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent/90 transition-colors flex items-center gap-2",
                        isSubmitting && "opacity-60 cursor-not-allowed"
                    )}
                >
                    <Save className={cn("h-4 w-4", isSubmitting && "animate-pulse")} />
                    {isEdit ? t('actions.save') : t('actions.create')}
                </button>
            </div>
        </form>
    );
}
