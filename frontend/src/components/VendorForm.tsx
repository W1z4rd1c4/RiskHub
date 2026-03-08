import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Save, X } from 'lucide-react';

import { IMPACT_DESCRIPTIONS, formatFinancialRange } from '@/constants/riskScoreDescriptions';
import { useTotalAssetsValue } from '@/hooks/useRiskHubConfig';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import { lookupApi } from '@/services/lookupApi';
import type { UserLookupItem } from '@/services/lookupApi';
import { vendorApi } from '@/services/vendorApi';
import type {
    Vendor,
    VendorCreate,
    VendorReplaceability,
    VendorStatus,
    VendorType,
    VendorUpdate,
} from '@/types/vendor';
import {
    VendorActionButton,
    VendorBadge,
    VendorInlineMessage,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

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

    const ownerOptions = useMemo(
        () =>
            users.map((user) => ({
                value: String(user.id),
                label: user.department_name ? `${user.name} — ${user.department_name}` : user.name,
            })),
        [users],
    );

    const departmentOptions = useMemo(
        () =>
            departments.map((department) => ({
                value: String(department.id),
                label: department.code ? `${department.name} (${department.code})` : department.name,
            })),
        [departments],
    );

    useEffect(() => {
        const loadLookups = async () => {
            try {
                const [userData, departmentData, vendorData] = await Promise.all([
                    lookupApi.getUsers(),
                    lookupApi.getDepartments(),
                    vendorApi.getVendors({ skip: 0, limit: 100 }),
                ]);
                setUsers(userData);
                setDepartments(departmentData);

                const processes = [...new Set(vendorData.items.map((vendor) => vendor.process).filter(Boolean))];
                setExistingProcesses(processes);

                const subprocMap: Record<string, string[]> = {};
                vendorData.items.forEach((vendor) => {
                    if (vendor.process && vendor.subprocess) {
                        if (!subprocMap[vendor.process]) {
                            subprocMap[vendor.process] = [];
                        }
                        if (!subprocMap[vendor.process].includes(vendor.subprocess)) {
                            subprocMap[vendor.process].push(vendor.subprocess);
                        }
                    }
                });
                setSubprocessesByProcess(subprocMap);
            } catch (loadError) {
                console.error('Failed to load vendor lookups:', loadError);
            }
        };

        void loadLookups();
    }, []);

    const handleChange = (field: keyof Vendor, value: unknown) => {
        setFormData((previous) => {
            const next = { ...previous, [field]: value };

            if (field === 'outsourcing_owner_user_id') {
                const owner = users.find((user) => user.id === value);
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

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (!validate()) {
            return;
        }

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
        } catch (saveError) {
            console.error('Failed to save vendor:', saveError);
            setError(t('errors.save_failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const score = formData.risk_score_1_5 || 3;
    const impact = IMPACT_DESCRIPTIONS[score as 1 | 2 | 3 | 4 | 5];
    const financialRange = formatFinancialRange(score, totalAssets, t('form.financial.no_loss'));

    const processSuggestions = existingProcesses.filter((processName) =>
        processName.toLowerCase().includes((formData.process || '').toLowerCase()),
    );
    const subprocessSuggestions = (subprocessesByProcess[formData.process || ''] || []).filter((subprocessName) =>
        subprocessName.toLowerCase().includes((formData.subprocess || '').toLowerCase()),
    );

    const renderSuggestions = (
        items: string[],
        onSelect: (value: string) => void,
    ) => {
        if (items.length === 0) {
            return null;
        }

        return (
            <div className="vendor-suggestion-box">
                {items.slice(0, 6).map((item) => (
                    <button
                        type="button"
                        key={item}
                        onClick={() => onSelect(item)}
                        className="vendor-suggestion-button"
                    >
                        {item}
                    </button>
                ))}
            </div>
        );
    };

    const renderFlagCheckbox = (key: VendorFlagKey, label: string) => (
        <label key={key} className="vendor-checkbox">
            <input
                type="checkbox"
                checked={!!formData[key]}
                onChange={(event) => handleChange(key as keyof Vendor, event.target.checked)}
                className="accent-accent"
            />
            {label}
        </label>
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error ? (
                <VendorInlineMessage tone="danger">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                </VendorInlineMessage>
            ) : null}

            <VendorSurface tone="emphasis" className="space-y-5">
                <VendorSectionHeader title={t('form.sections.identity')} />

                <div className="vendor-form-grid">
                    <div className="vendor-field">
                        <label className="vendor-label">{t('form.name')}</label>
                        <input
                            value={formData.name || ''}
                            onChange={(event) => handleChange('name', event.target.value)}
                            className="vendor-input"
                            placeholder={t('form.name_placeholder')}
                        />
                    </div>

                    <div className="vendor-field">
                        <label className="vendor-label">{t('form.vendor_type.label')}</label>
                        <ThemedSelect
                            value={(formData.vendor_type || 'other') as string}
                            onValueChange={(value) => handleChange('vendor_type', value)}
                            options={vendorTypeOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
                        />
                    </div>

                    <div className="vendor-field">
                        <label className="vendor-label">{t('form.legal_name')}</label>
                        <input
                            value={formData.legal_name || ''}
                            onChange={(event) => handleChange('legal_name', event.target.value)}
                            className="vendor-input"
                        />
                    </div>

                    <div className="vendor-field">
                        <label className="vendor-label">{t('form.registration_id')}</label>
                        <input
                            value={formData.registration_id || ''}
                            onChange={(event) => handleChange('registration_id', event.target.value)}
                            className="vendor-input"
                        />
                    </div>

                    <div className="vendor-field">
                        <label className="vendor-label">{t('form.country')}</label>
                        <input
                            value={formData.country || ''}
                            onChange={(event) => handleChange('country', event.target.value)}
                            className="vendor-input"
                        />
                    </div>

                    <div className="vendor-field">
                        <label className="vendor-label">{t('form.website')}</label>
                        <input
                            value={formData.website || ''}
                            onChange={(event) => handleChange('website', event.target.value)}
                            className="vendor-input"
                        />
                    </div>

                    <div className="vendor-field md:col-span-2">
                        <label className="vendor-label">{t('form.description')}</label>
                        <textarea
                            value={formData.description || ''}
                            onChange={(event) => handleChange('description', event.target.value)}
                            rows={3}
                            className="vendor-textarea"
                        />
                    </div>
                </div>
            </VendorSurface>

            <VendorSurface className="space-y-5">
                <VendorSectionHeader title={t('form.sections.ownership')} />

                <div className="vendor-form-grid">
                    <div className="vendor-field">
                        <label className="vendor-label">{t('form.department')}</label>
                        <ThemedSelect
                            value={formData.department_id ? String(formData.department_id) : ''}
                            onValueChange={(value) => handleChange('department_id', value ? Number(value) : null)}
                            placeholder={t('form.department_placeholder')}
                            allowEmpty
                            emptyLabel={t('form.department_placeholder')}
                            options={departmentOptions}
                        />
                    </div>

                    <div className="vendor-field">
                        <label className="vendor-label">{t('form.owner')}</label>
                        <ThemedSelect
                            value={formData.outsourcing_owner_user_id ? String(formData.outsourcing_owner_user_id) : ''}
                            onValueChange={(value) => handleChange('outsourcing_owner_user_id', value ? Number(value) : 0)}
                            placeholder={t('form.owner_placeholder')}
                            allowEmpty
                            emptyLabel={t('form.owner_placeholder')}
                            options={ownerOptions}
                        />
                    </div>

                    <div className="vendor-field relative">
                        <label className="vendor-label">{t('form.process')}</label>
                        <input
                            value={formData.process || ''}
                            onChange={(event) => handleChange('process', event.target.value)}
                            className="vendor-input"
                            placeholder={t('form.process_placeholder')}
                        />
                        {(formData.process || '').length > 0
                            ? renderSuggestions(processSuggestions, (value) => handleChange('process', value))
                            : null}
                    </div>

                    <div className="vendor-field relative">
                        <label className="vendor-label">{t('form.subprocess')}</label>
                        <input
                            value={formData.subprocess || ''}
                            onChange={(event) => handleChange('subprocess', event.target.value)}
                            className="vendor-input"
                            placeholder={t('form.subprocess_placeholder')}
                        />
                        {(formData.subprocess || '').length > 0
                            ? renderSuggestions(subprocessSuggestions, (value) => handleChange('subprocess', value))
                            : null}
                    </div>
                </div>
            </VendorSurface>

            <VendorSurface className="space-y-5">
                <VendorSectionHeader title={t('form.sections.classification')} />

                <div className="space-y-5">
                    <div className="vendor-field">
                        <label className="vendor-label">{t('form.risk_score')}</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min={1}
                                max={5}
                                value={score}
                                onChange={(event) => handleChange('risk_score_1_5', Number(event.target.value))}
                                className={cn(
                                    'w-full',
                                    score >= 5
                                        ? 'accent-rose-500'
                                        : score >= 4
                                            ? 'accent-orange-500'
                                            : score >= 3
                                                ? 'accent-amber-500'
                                                : score >= 2
                                                    ? 'accent-blue-500'
                                                    : 'accent-emerald-500',
                                )}
                            />
                            <div className={cn('px-2.5 py-1 rounded-full text-[10px] font-black border whitespace-nowrap', scoreColor(score))}>
                                {score} / 5
                            </div>
                        </div>
                        <p className="text-xs vendor-muted">
                            <span className="font-semibold vendor-text">
                                {impact ? t(impact.labelKey, impact.labelKey) : ''}
                            </span>
                            {financialRange ? ` • ${financialRange}` : null}
                        </p>
                    </div>

                    <div className="vendor-form-grid">
                        <div className="vendor-field">
                            <label className="vendor-label">{t('form.flags')}</label>
                            <div className="flex flex-wrap gap-2">
                                {formData.supports_important_core_insurance_function ? (
                                    <VendorBadge tone="success">{t('flags.supports_core_function')}</VendorBadge>
                                ) : null}
                                {formData.dora_relevant ? (
                                    <VendorBadge tone="info">{t('flags.dora_relevant')}</VendorBadge>
                                ) : null}
                                {formData.is_significant_vendor ? (
                                    <VendorBadge tone="warn">{t('flags.significant_vendor')}</VendorBadge>
                                ) : null}
                            </div>
                        </div>

                        <div className="vendor-field md:col-span-2">
                            <div className="vendor-checkbox-list">
                                {renderFlagCheckbox('supports_important_core_insurance_function', t('flags.supports_core_function'))}
                                {renderFlagCheckbox('dora_relevant', t('flags.dora_relevant'))}
                                {renderFlagCheckbox('is_significant_vendor', t('flags.significant_vendor'))}
                            </div>
                        </div>
                    </div>
                </div>
            </VendorSurface>

            <VendorSurface className="space-y-5">
                <VendorSectionHeader title={t('form.sections.resilience', 'Resilience & Monitoring')} />

                <div className="vendor-form-grid">
                    <div className="vendor-field">
                        <label className="vendor-label">{t('form.replaceability.label')}</label>
                        <ThemedSelect
                            value={formData.replaceability ? String(formData.replaceability) : ''}
                            onValueChange={(value) => handleChange('replaceability', value || null)}
                            placeholder={t('form.replaceability.placeholder')}
                            allowEmpty
                            emptyLabel={t('form.replaceability.placeholder')}
                            options={replaceabilityOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
                        />
                    </div>

                    <div className="vendor-field">
                        <label className="vendor-label">{t('form.status')}</label>
                        <ThemedSelect
                            value={(formData.status || 'active') as string}
                            onValueChange={(value) => handleChange('status', value)}
                            options={[
                                { value: 'active', label: t('status.active') },
                                { value: 'inactive', label: t('status.inactive') },
                            ]}
                        />
                    </div>

                    <div className="vendor-field md:col-span-2">
                        <label className="vendor-label">{t('flags.has_alternatives')}</label>
                        {renderFlagCheckbox('has_alternative_providers', t('flags.has_alternatives'))}
                    </div>
                </div>
            </VendorSurface>

            <div className="flex items-center justify-end gap-3">
                {onCancel ? (
                    <VendorActionButton type="button" onClick={onCancel}>
                        <X className="h-4 w-4" />
                        {t('actions.cancel')}
                    </VendorActionButton>
                ) : null}
                <VendorActionButton type="submit" variant="primary" disabled={isSubmitting}>
                    <Save className={cn('h-4 w-4', isSubmitting && 'animate-pulse')} />
                    {isEdit ? t('actions.save') : t('actions.create')}
                </VendorActionButton>
            </div>
        </form>
    );
}
