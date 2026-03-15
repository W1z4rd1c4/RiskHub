import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    Building2,
    Calendar,
    CheckCircle,
    Clock,
    Save,
    Search,
    Target,
    TriangleAlert,
    User,
    X,
} from 'lucide-react';

import { parseUpdateResult } from '@/lib/approvalUi';
import { getKriDraftValidationErrorKey } from '@/components/kri/kriFormValidation';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n/hooks';
import { ApiClientError } from '@/services/apiClient';
import { kriApi } from '@/services/kriApi';
import { riskApi } from '@/services/riskApi';
import { userApi } from '@/services/userApi';
import { vendorApi } from '@/services/vendorApi';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import { KRIFrequencies, type KRICreate, type KRIFrequency } from '@/types/kri';
import type { RiskSummary } from '@/types/risk';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { KRIVendorSelector, type KRIVendorOption } from '@/components/kri/KRIVendorSelector';

function mergeVendorOptions(
    current: KRIVendorOption[],
    incoming: KRIVendorOption[],
): KRIVendorOption[] {
    const merged = new Map<number, KRIVendorOption>();
    for (const vendor of current) {
        merged.set(vendor.id, vendor);
    }
    for (const vendor of incoming) {
        merged.set(vendor.id, vendor);
    }
    return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function mergeRiskSummaries<T extends { id: number }>(...riskSets: T[][]): T[] {
    const merged = new Map<number, T>();
    for (const riskSet of riskSets) {
        for (const risk of riskSet) {
            merged.set(risk.id, risk);
        }
    }
    return [...merged.values()];
}

export interface KRIFormVendorContext {
    vendorId: number;
    vendorName?: string;
    returnTo: string;
}

interface KRIFormProps {
    initialData?: Partial<KRICreate>;
    isEdit?: boolean;
    kriId?: number;
    onSuccess?: (kriId: number) => void | Promise<void>;
    onCancel?: () => void;
    firstStepBackLabel?: string;
    vendorContext?: KRIFormVendorContext | null;
    initialLinkedVendorIds?: number[];
}

export function KRIForm({
    initialData,
    isEdit = false,
    kriId,
    onSuccess,
    onCancel,
    firstStepBackLabel,
    vendorContext = null,
    initialLinkedVendorIds = [],
}: KRIFormProps) {
    const { t } = useTranslation(['kris', 'common', 'errorKeys', 'approvals', 'vendors']);
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [approvalQueued, setApprovalQueued] = useState<{ id: number; message: string } | null>(null);
    const [currentStep, setCurrentStep] = useState(0);

    const [riskSearch, setRiskSearch] = useState('');
    const debouncedRiskSearch = useDebouncedValue(riskSearch, 300);
    const [genericRisks, setGenericRisks] = useState<RiskSummary[]>([]);
    const [vendorLinkedRisks, setVendorLinkedRisks] = useState<RiskSummary[]>([]);
    const [selectedRiskRecord, setSelectedRiskRecord] = useState<RiskSummary | null>(null);
    const [isLoadingGenericRisks, setIsLoadingGenericRisks] = useState(false);
    const [isLoadingVendorLinkedRisks, setIsLoadingVendorLinkedRisks] = useState(Boolean(vendorContext));
    const [showOnlyVendorLinkedRisks, setShowOnlyVendorLinkedRisks] = useState(Boolean(vendorContext));
    const [vendorLinkedRiskIds, setVendorLinkedRiskIds] = useState<number[]>([]);

    const [vendorSearch, setVendorSearch] = useState('');
    const debouncedVendorSearch = useDebouncedValue(vendorSearch, 300);
    const [isLoadingVendors, setIsLoadingVendors] = useState(false);
    const [vendorOptions, setVendorOptions] = useState<KRIVendorOption[]>([]);
    const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>(initialLinkedVendorIds);
    const [selectedVendorOptions, setSelectedVendorOptions] = useState<KRIVendorOption[]>([]);

    const [isMismatchDialogOpen, setIsMismatchDialogOpen] = useState(false);

    const [formData, setFormData] = useState<Partial<KRICreate>>({
        risk_id: undefined,
        metric_name: '',
        description: '',
        current_value: 0,
        lower_limit: 0,
        upper_limit: 100,
        unit: '%',
        frequency: 'quarterly',
        reporting_owner_id: undefined,
        ...initialData,
    });

    const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([]);
    const [selectedDeptId, setSelectedDeptId] = useState('');
    const [selectedProcess, setSelectedProcess] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const effectiveVendorIds = useMemo(
        () =>
            vendorContext
                ? Array.from(new Set([...selectedVendorIds, vendorContext.vendorId]))
                : selectedVendorIds,
        [selectedVendorIds, vendorContext],
    );

    const displayedRisks = useMemo(
        () => (showOnlyVendorLinkedRisks && vendorContext ? vendorLinkedRisks : genericRisks),
        [genericRisks, showOnlyVendorLinkedRisks, vendorContext, vendorLinkedRisks],
    );

    const knownRisks = useMemo(
        () => mergeRiskSummaries(displayedRisks, vendorLinkedRisks, genericRisks, selectedRiskRecord ? [selectedRiskRecord] : []),
        [displayedRisks, genericRisks, selectedRiskRecord, vendorLinkedRisks],
    );

    useEffect(() => {
        if (isEdit || (vendorContext && showOnlyVendorLinkedRisks)) {
            setGenericRisks([]);
            return;
        }

        const loadRisks = async () => {
            try {
                setIsLoadingGenericRisks(true);
                setError(null);
                const response = await riskApi.getRisks({
                    skip: 0,
                    limit: 50,
                    search: debouncedRiskSearch.trim() || undefined,
                    department_id: selectedDeptId ? parseInt(selectedDeptId, 10) : undefined,
                    process: selectedProcess || undefined,
                    category: selectedCategory || undefined,
                    include_archived: false,
                });
                setGenericRisks(response?.items ?? []);
            } catch (err: unknown) {
                console.error('Error loading risks:', err);
                setError('errorKeys.request_failed');
            } finally {
                setIsLoadingGenericRisks(false);
            }
        };
        void loadRisks();
    }, [debouncedRiskSearch, isEdit, selectedCategory, selectedDeptId, selectedProcess, showOnlyVendorLinkedRisks, vendorContext]);

    useEffect(() => {
        const loadUsers = async () => {
            try {
                const userList = await userApi.listVisibleUsers();
                setUsers(userList);
            } catch (err) {
                console.error('Error loading users:', err);
            }
        };
        void loadUsers();
    }, []);

    useEffect(() => {
        const loadVendors = async () => {
            try {
                setIsLoadingVendors(true);
                const response = await vendorApi.getVendors({
                    skip: 0,
                    limit: 25,
                    include_archived: true,
                    search: debouncedVendorSearch.trim() || undefined,
                });
                setVendorOptions(
                    response.items.map((vendor) => ({
                        id: vendor.id,
                        name: vendor.name,
                        status: vendor.status,
                    })),
                );
            } catch (err) {
                console.error('Error loading vendors for KRI form:', err);
            } finally {
                setIsLoadingVendors(false);
            }
        };
        void loadVendors();
    }, [debouncedVendorSearch]);

    useEffect(() => {
        if (vendorOptions.length === 0) {
            return;
        }
        setSelectedVendorOptions((current) => mergeVendorOptions(current, vendorOptions));
    }, [vendorOptions]);

    useEffect(() => {
        if (!vendorContext) {
            setVendorLinkedRiskIds([]);
            setVendorLinkedRisks([]);
            setIsLoadingVendorLinkedRisks(false);
            return;
        }

        const loadVendorLinkedRisks = async () => {
            try {
                setIsLoadingVendorLinkedRisks(true);
                const linkedRisks = await vendorLinkApi.getLinkedRisks(vendorContext.vendorId);
                setVendorLinkedRiskIds(linkedRisks.map((risk) => risk.id));
                setVendorLinkedRisks(
                    linkedRisks.map((risk) => ({
                        id: risk.id,
                        risk_id_code: risk.risk_id_code,
                        name: risk.name,
                        process: risk.process,
                        risk_type: risk.risk_type ?? '',
                        category: risk.category ?? '',
                        description: '',
                        gross_score: risk.gross_score ?? 0,
                        gross_probability: 0,
                        gross_impact: 0,
                        net_score: risk.net_score ?? 0,
                        status: (risk.status as RiskSummary['status']) ?? 'active',
                        is_priority: risk.is_priority,
                        department_id: risk.department_id ?? undefined,
                        department_name: risk.department_name ?? undefined,
                    })),
                );
            } catch (err) {
                console.error('Error loading vendor-linked risks for KRI form:', err);
                setVendorLinkedRiskIds([]);
                setVendorLinkedRisks([]);
            } finally {
                setIsLoadingVendorLinkedRisks(false);
            }
        };
        void loadVendorLinkedRisks();
    }, [vendorContext]);

    useEffect(() => {
        if (!formData.risk_id) {
            setSelectedRiskRecord(null);
            return;
        }

        const existingRisk = mergeRiskSummaries(displayedRisks, vendorLinkedRisks, genericRisks).find(
            (risk) => risk.id === formData.risk_id,
        );
        if (existingRisk) {
            setSelectedRiskRecord(existingRisk);
            return;
        }

        const loadSelectedRisk = async () => {
            try {
                const risk = await riskApi.getRisk(formData.risk_id as number);
                setSelectedRiskRecord({
                    id: risk.id,
                    risk_id_code: risk.risk_id_code,
                    name: risk.name,
                    process: risk.process,
                    risk_type: risk.risk_type,
                    category: risk.category,
                    description: risk.description,
                    gross_score: risk.gross_score,
                    gross_probability: risk.gross_probability,
                    gross_impact: risk.gross_impact,
                    net_score: risk.net_score,
                    status: risk.status,
                    is_priority: risk.is_priority,
                    department_id: risk.department_id,
                    department_name: risk.department?.name ?? risk.department?.code ?? undefined,
                    owner_id: risk.owner_id,
                });
            } catch (err) {
                console.error('Error loading selected risk for KRI form:', err);
            }
        };
        void loadSelectedRisk();
    }, [displayedRisks, formData.risk_id, genericRisks, vendorLinkedRisks]);

    const handleInputChange = <K extends keyof KRICreate>(field: K, value: KRICreate[K] | undefined) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        setError(null);
    };

    const handleSelectedVendorIdsChange = (vendorIds: number[]) => {
        setSelectedVendorIds(vendorIds);
        setSelectedVendorOptions((current) =>
            mergeVendorOptions(
                current.filter((vendor) => vendorIds.includes(vendor.id)),
                vendorOptions.filter((vendor) => vendorIds.includes(vendor.id)),
            ),
        );
        setError(null);
    };

    const validateStep1 = () => {
        if (!formData.risk_id) {
            setError(t('kris:form.validation.risk_required'));
            return false;
        }
        return true;
    };

    const validateStep2 = () => {
        const validationError = getKriDraftValidationErrorKey(formData);
        if (validationError) {
            setError(t(validationError, { ns: 'kris' }));
            return false;
        }
        return true;
    };

    const nextStep = () => {
        if (currentStep === 0 && !validateStep1()) return;
        setError(null);
        setCurrentStep(1);
    };

    const prevStep = () => {
        setError(null);
        setCurrentStep(0);
    };

    const isSelectedRiskLinkedToVendor = Boolean(
        vendorContext &&
        formData.risk_id &&
        vendorLinkedRiskIds.includes(formData.risk_id),
    );

    const finalizeCreate = async (options?: { linkRiskFirst?: boolean }) => {
        if (!validateStep1() || !validateStep2()) {
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);
            setApprovalQueued(null);
            const newKRI = await kriApi.createKRI({
                ...(formData as KRICreate),
                linked_vendor_ids: effectiveVendorIds,
                ensure_parent_risk_vendor_ids:
                    vendorContext && options?.linkRiskFirst
                        ? [vendorContext.vendorId]
                        : undefined,
            });

            if (vendorContext) {
                navigate(vendorContext.returnTo, {
                    state: {
                        vendorFlash: {
                            tone: 'success',
                            message: t('vendors:links.kris.created_and_linked'),
                            ctaHref: `/kris/${newKRI.id}`,
                            ctaLabel: t('vendors:links.actions.open_kri'),
                        },
                    },
                });
                return;
            }

            if (onSuccess) {
                await onSuccess(newKRI.id);
                return;
            }

            navigate(`/kris/${newKRI.id}`);
        } catch (err: unknown) {
            console.error('Error saving KRI:', err);
            if (err instanceof ApiClientError) {
                setError(err.rawMessage ?? err.messageKey);
            } else {
                setError('errorKeys.save_kri_failed');
            }
        } finally {
            setIsSubmitting(false);
            setIsMismatchDialogOpen(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateStep1() || !validateStep2()) {
            return;
        }

        if (!isEdit) {
            if (vendorContext && formData.risk_id && !isSelectedRiskLinkedToVendor) {
                setIsMismatchDialogOpen(true);
                return;
            }
            await finalizeCreate();
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);
            setApprovalQueued(null);

            if (isEdit && kriId) {
                const { current_value: _currentValue, ...updatePayload } = formData;
                const result = await kriApi.updateKRI(kriId, {
                    ...updatePayload,
                    linked_vendor_ids: effectiveVendorIds,
                });
                const parsed = parseUpdateResult(result);
                if (parsed.kind === 'approval') {
                    setApprovalQueued({
                        id: parsed.approvalId,
                        message: parsed.message,
                    });
                    setIsSubmitting(false);
                    return;
                }

            }

            if (kriId) {
                navigate(`/kris/${kriId}`);
            }
        } catch (err: unknown) {
            console.error('Error saving KRI:', err);
            if (err instanceof ApiClientError) {
                setError(err.rawMessage ?? err.messageKey);
            } else {
                setError('errorKeys.save_kri_failed');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const uniqueDepartments = useMemo(
        () =>
            Array.from(
                new Map(
                    displayedRisks
                        .filter((risk) => risk.department_id && risk.department_name)
                        .map((risk) => [risk.department_id as number, risk.department_name as string]),
                ).entries(),
            )
                .map(([id, name]) => ({ value: String(id), label: name }))
                .sort((left, right) => left.label.localeCompare(right.label)),
        [displayedRisks],
    );
    const uniqueProcesses = useMemo(
        () => [...new Set(displayedRisks.map((risk) => risk.process).filter(Boolean))].sort() as string[],
        [displayedRisks],
    );
    const uniqueCategories = useMemo(
        () => [...new Set(displayedRisks.map((risk) => risk.category).filter(Boolean))].sort() as string[],
        [displayedRisks],
    );

    const filteredRisks = useMemo(
        () =>
            displayedRisks.filter((risk) => {
                const matchesSearch = !riskSearch ||
                    risk.risk_id_code?.toLowerCase().includes(riskSearch.toLowerCase()) ||
                    risk.name?.toLowerCase().includes(riskSearch.toLowerCase()) ||
                    risk.process.toLowerCase().includes(riskSearch.toLowerCase()) ||
                    risk.category?.toLowerCase().includes(riskSearch.toLowerCase()) ||
                    risk.department_name?.toLowerCase().includes(riskSearch.toLowerCase());

                const matchesDept = !selectedDeptId || String(risk.department_id ?? '') === selectedDeptId;
                const matchesProcess = !selectedProcess || risk.process === selectedProcess;
                const matchesCategory = !selectedCategory || risk.category === selectedCategory;
                const matchesVendorScope = !showOnlyVendorLinkedRisks || !vendorContext
                    ? true
                    : vendorLinkedRiskIds.includes(risk.id);

                return matchesSearch && matchesDept && matchesProcess && matchesCategory && matchesVendorScope;
            }),
        [
            riskSearch,
            displayedRisks,
            selectedCategory,
            selectedDeptId,
            selectedProcess,
            showOnlyVendorLinkedRisks,
            vendorContext,
            vendorLinkedRiskIds,
        ],
    );

    const selectedRisk = knownRisks.find((risk) => risk.id === formData.risk_id);
    const cancelLabel = firstStepBackLabel ?? t('common:actions.cancel');

    return (
        <>
            <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl mx-auto">
                <div className="glass-card min-h-[560px] flex flex-col">
                    {approvalQueued && (
                        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                            <Clock className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-amber-200 text-sm font-medium">
                                    {t('approval_submitted', { ns: 'errorKeys' })} (ID: {approvalQueued.id})
                                </p>
                                <p className="text-amber-400/80 text-xs mt-1">
                                    {approvalQueued.message.startsWith('errorKeys.')
                                        ? t(approvalQueued.message, { ns: 'errorKeys' })
                                        : approvalQueued.message}
                                </p>
                                <div className="mt-3 flex gap-3">
                                    <Link
                                        to="/approvals"
                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-100 transition-colors"
                                    >
                                        <CheckCircle className="h-3.5 w-3.5" />
                                        {t('common:actions.view')} {t('approvals:title', { ns: 'approvals', defaultValue: 'Approvals' })}
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => setApprovalQueued(null)}
                                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        {t('common:actions.close')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-medium animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="h-5 w-5" />
                            {error.startsWith('errorKeys.')
                                ? t(error, { ns: 'errorKeys' })
                                : error.startsWith('kris:')
                                    ? t(error, { ns: 'kris' })
                                    : error}
                        </div>
                    )}

                    {vendorContext ? (
                        <div
                            className="mb-6 rounded-2xl border border-accent/20 bg-accent/10 p-4"
                            data-testid="kri-vendor-context-banner"
                        >
                            <div className="flex items-start gap-3">
                                <div className="rounded-xl border border-accent/20 bg-accent/10 p-2.5">
                                    <Building2 className="h-4 w-4 text-accent" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-accent">
                                        {t('kris:vendor_assignment.vendor_context_label')}
                                    </p>
                                    <p className="mt-1 text-sm font-medium text-white">
                                        {vendorContext.vendorName || t('kris:vendor_assignment.vendor_context_active')}
                                    </p>
                                    <p className="mt-2 text-xs text-slate-400">
                                        {t('kris:vendor_assignment.vendor_context_help')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    <div className="flex-1 space-y-8">
                        {currentStep === 0 && (
                            <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center justify-between gap-4 mb-4">
                                    <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                                        <Target className="h-4 w-4 text-accent" />
                                        {t('kris:actions.link_risk')}
                                    </h3>
                                    {vendorContext ? (
                                        <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1">
                                            <button
                                                type="button"
                                                onClick={() => setShowOnlyVendorLinkedRisks(true)}
                                                className={`rounded-md px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                                                    showOnlyVendorLinkedRisks
                                                        ? 'bg-accent text-slate-950'
                                                        : 'text-slate-500 hover:text-white'
                                                }`}
                                            >
                                                {t('kris:vendor_assignment.vendor_risks_only')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowOnlyVendorLinkedRisks(false)}
                                                className={`rounded-md px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                                                    !showOnlyVendorLinkedRisks
                                                        ? 'bg-accent text-slate-950'
                                                        : 'text-slate-500 hover:text-white'
                                                }`}
                                            >
                                                {t('kris:vendor_assignment.all_readable_risks')}
                                            </button>
                                        </div>
                                    ) : null}
                                </div>

                                {selectedRisk ? (
                                    <div className="p-4 bg-accent/10 border border-accent/30 rounded-xl">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-bold text-white">{selectedRisk.name}</p>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {selectedRisk.process} • {selectedRisk.category || t('common:labels.unknown')}
                                                </p>
                                                <p className="text-xs text-slate-300 mt-2 italic">{selectedRisk.description}</p>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {selectedRisk.department_name ? (
                                                        <span className="inline-block px-2 py-0.5 rounded bg-white/10 text-[10px] uppercase font-bold text-slate-300">
                                                            {selectedRisk.department_name}
                                                        </span>
                                                    ) : null}
                                                    {vendorContext ? (
                                                        <span
                                                            className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                                                isSelectedRiskLinkedToVendor
                                                                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                                                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                                            }`}
                                                        >
                                                            {isSelectedRiskLinkedToVendor
                                                                ? t('kris:vendor_assignment.risk_linked_to_vendor')
                                                                : t('kris:vendor_assignment.risk_not_linked_to_vendor')}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleInputChange('risk_id', undefined)}
                                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                            >
                                                <X className="h-4 w-4 text-slate-400" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <ThemedSelect
                                                value={selectedDeptId}
                                                onValueChange={setSelectedDeptId}
                                                placeholder={t('form.placeholders.all_departments')}
                                                allowEmpty
                                                emptyLabel={t('form.placeholders.all_departments')}
                                                options={uniqueDepartments}
                                            />

                                            <ThemedSelect
                                                value={selectedProcess}
                                                onValueChange={setSelectedProcess}
                                                placeholder={t('form.placeholders.all_processes')}
                                                allowEmpty
                                                emptyLabel={t('form.placeholders.all_processes')}
                                                options={uniqueProcesses.map((process) => ({ value: process, label: process }))}
                                            />

                                            <ThemedSelect
                                                value={selectedCategory}
                                                onValueChange={setSelectedCategory}
                                                placeholder={t('form.placeholders.all_categories')}
                                                allowEmpty
                                                emptyLabel={t('form.placeholders.all_categories')}
                                                options={uniqueCategories.map((category) => ({ value: category, label: category }))}
                                            />
                                        </div>

                                        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all">
                                            <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                                            <input
                                                type="text"
                                                placeholder={t('form.placeholders.search_risks')}
                                                value={riskSearch}
                                                onChange={(event) => setRiskSearch(event.target.value)}
                                                className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                                            />
                                        </div>

                                        <div className="max-h-[400px] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5 custom-scrollbar">
                                            {(showOnlyVendorLinkedRisks && vendorContext ? isLoadingVendorLinkedRisks : isLoadingGenericRisks) ? (
                                                <div className="p-8 text-center text-slate-500 text-sm">
                                                    <div className="animate-spin h-5 w-5 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2" />
                                                    {t('common:loading.risk_data')}
                                                </div>
                                            ) : displayedRisks.length === 0 ? (
                                                <div className="p-8 text-center text-slate-500 text-sm">
                                                    {showOnlyVendorLinkedRisks && vendorContext
                                                        ? t('kris:vendor_assignment.no_vendor_risks_available')
                                                        : t('common:empty.no_risks_found')}
                                                </div>
                                            ) : filteredRisks.length === 0 ? (
                                                <div className="p-8 text-center text-slate-500 text-sm">
                                                    {showOnlyVendorLinkedRisks && vendorContext
                                                        ? t('kris:vendor_assignment.no_vendor_risks')
                                                        : t('common:labels.no_results')}
                                                </div>
                                            ) : (
                                                filteredRisks.slice(0, 20).map((risk) => (
                                                    <button
                                                        key={risk.id}
                                                        type="button"
                                                        onClick={() => handleInputChange('risk_id', risk.id)}
                                                        className="w-full text-left hover:brightness-125 transition-all flex items-stretch gap-2 group p-2"
                                                    >
                                                        <div className="bg-white/5 rounded-lg p-3 w-[200px] shrink-0 flex flex-col justify-center group-hover:bg-white/10 transition-colors">
                                                            <p className="text-sm font-bold text-white truncate" title={risk.name}>
                                                                {risk.name}
                                                            </p>
                                                            <p className="text-[10px] text-slate-500 mt-1 truncate" title={risk.process}>
                                                                {risk.process}
                                                            </p>
                                                        </div>

                                                        <div className="bg-white/5 rounded-lg p-3 flex-1 flex items-center group-hover:bg-white/10 transition-colors">
                                                            {risk.description ? (
                                                                <p className="text-[10px] text-slate-400 break-words leading-tight">
                                                                    {risk.description.length > 120
                                                                        ? `${risk.description.slice(0, 120)}...`
                                                                        : risk.description}
                                                                </p>
                                                            ) : (
                                                                <span className="text-[10px] text-slate-600 italic">
                                                                    {t('common:empty.no_description')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        {currentStep === 1 && (
                            <section className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-4">
                                    {t('kris:fields.name')} {t('common:labels.details')}
                                </h3>

                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                            {t('kris:fields.name')} *
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            autoFocus
                                            value={formData.metric_name}
                                            onChange={(event) => handleInputChange('metric_name', event.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                            placeholder={t('form.placeholders.metric_name')}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                            {t('common:labels.description')} *
                                        </label>
                                        <textarea
                                            required
                                            rows={3}
                                            value={formData.description}
                                            onChange={(event) => handleInputChange('description', event.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all resize-none"
                                            placeholder={t('form.placeholders.description')}
                                        />
                                    </div>

                                    <div className="grid md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                                {t('kris:fields.current_value')} *
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                required
                                                value={formData.current_value}
                                                onChange={(event) => handleInputChange('current_value', parseFloat(event.target.value) || 0)}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-accent/50 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">
                                                {t('kris:fields.lower_limit')}
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={formData.lower_limit}
                                                onChange={(event) => handleInputChange('lower_limit', parseFloat(event.target.value) || 0)}
                                                className="w-full bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-400 outline-none focus:border-emerald-500/50 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-rose-500 uppercase tracking-widest mb-2">
                                                {t('kris:fields.upper_limit')}
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={formData.upper_limit}
                                                onChange={(event) => handleInputChange('upper_limit', parseFloat(event.target.value) || 0)}
                                                className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 outline-none focus:border-rose-500/50 transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                            {t('kris:fields.unit')}
                                        </label>
                                        <ThemedSelect
                                            value={formData.unit || '%'}
                                            onValueChange={(value) => handleInputChange('unit', value)}
                                            className="w-full"
                                            options={[
                                                { value: '%', label: t('kris:form.units.percentage') },
                                                { value: 'count', label: t('kris:form.units.count') },
                                                { value: 'days', label: t('kris:form.units.days') },
                                                { value: 'hours', label: t('kris:form.units.hours') },
                                                { value: 'CZK', label: 'CZK' },
                                                { value: 'EUR', label: 'EUR' },
                                                { value: 'ratio', label: t('kris:form.units.ratio') },
                                            ]}
                                        />
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {t('kris:fields.frequency')}
                                            </label>
                                            <ThemedSelect
                                                value={formData.frequency || 'quarterly'}
                                                onValueChange={(value) => {
                                                    if ((KRIFrequencies as readonly string[]).includes(value)) {
                                                        handleInputChange('frequency', value as KRIFrequency);
                                                    }
                                                }}
                                                className="w-full"
                                                options={[
                                                    { value: 'daily', label: t('frequencies.daily') },
                                                    { value: 'weekly', label: t('frequencies.weekly') },
                                                    { value: 'monthly', label: t('frequencies.monthly') },
                                                    { value: 'quarterly', label: t('frequencies.quarterly') },
                                                    { value: 'annually', label: t('frequencies.annually') },
                                                ]}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                {t('kris:fields.owner')}
                                            </label>
                                            <ThemedSelect
                                                value={formData.reporting_owner_id?.toString() ?? ''}
                                                onValueChange={(value) =>
                                                    handleInputChange('reporting_owner_id', value ? parseInt(value, 10) : undefined)
                                                }
                                                placeholder={t('form.placeholders.reporting_owner_default')}
                                                allowEmpty
                                                emptyLabel={t('form.placeholders.reporting_owner_default')}
                                                className="w-full"
                                                options={users.map((user) => ({
                                                    value: user.id.toString(),
                                                    label: `${user.name} (${user.email})`,
                                                }))}
                                            />
                                            <p className="text-[9px] text-slate-600 mt-1 ml-1">
                                                {t('kris:form.reporting_owner_hint')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-white/5">
                                        <KRIVendorSelector
                                            vendors={vendorOptions}
                                            selectedVendorIds={selectedVendorIds}
                                            selectedVendorOptions={selectedVendorOptions}
                                            onChange={handleSelectedVendorIdsChange}
                                            isLoading={isLoadingVendors}
                                            search={vendorSearch}
                                            onSearchChange={setVendorSearch}
                                            emptyStateLabel={
                                                debouncedVendorSearch.trim().length > 0
                                                    ? t('kris:vendor_assignment.empty_search')
                                                    : t('kris:vendor_assignment.empty')
                                            }
                                        />
                                        {vendorContext ? (
                                            <p className="mt-2 text-[10px] text-slate-500">
                                                {t('kris:vendor_assignment.vendor_context_auto_linked')}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>

                    <div className="mt-8 pt-8 border-t border-white/5 flex justify-between items-center">
                        {currentStep === 0 ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (onCancel) {
                                            onCancel();
                                            return;
                                        }
                                        navigate('/kris');
                                    }}
                                    className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
                                >
                                    <X className="h-4 w-4" />
                                    {cancelLabel}
                                </button>
                                <button type="button" onClick={nextStep} className="btn-primary">
                                    {t('common:actions.next')}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={prevStep}
                                    className="text-slate-400 hover:text-white transition-colors font-bold text-sm"
                                >
                                    {t('common:actions.back')}
                                </button>
                                <button type="submit" disabled={isSubmitting} className="btn-primary px-8">
                                    {isSubmitting
                                        ? t('common:loading.generic')
                                        : isEdit
                                            ? t('kris:edit_kri')
                                            : t('kris:create_kri')}
                                    <Save className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </form>

            {isMismatchDialogOpen ? (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <button
                        type="button"
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                        onClick={() => setIsMismatchDialogOpen(false)}
                        aria-label={t('common:actions.close')}
                    />
                    <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/95 p-6 shadow-2xl">
                        <div className="flex items-start gap-3">
                            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
                                <TriangleAlert className="h-5 w-5 text-amber-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white">
                                    {t('kris:vendor_assignment.mismatch_dialog.title')}
                                </h3>
                                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                                    {t('kris:vendor_assignment.mismatch_dialog.message')}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 flex flex-col gap-3">
                            <button
                                type="button"
                                onClick={() => void finalizeCreate({ linkRiskFirst: true })}
                                className="btn-primary justify-center"
                            >
                                {t('kris:vendor_assignment.mismatch_dialog.link_risk_and_continue')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void finalizeCreate({ linkRiskFirst: false })}
                                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-white hover:bg-white/[0.06] transition-colors"
                            >
                                {t('kris:vendor_assignment.mismatch_dialog.continue_without_linking')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsMismatchDialogOpen(false)}
                                className="w-full rounded-xl px-4 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                            >
                                {t('kris:vendor_assignment.mismatch_dialog.cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
