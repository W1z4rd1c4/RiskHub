import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Network, Plus, Save, X } from 'lucide-react';

import { SortableTable } from '@/components/tables';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { assetApi } from '@/services/assetApi';
import { logError } from '@/services/logger';
import { vendorContractApi } from '@/services/vendorContractApi';
import { vendorSubOutsourcingApi } from '@/services/vendorSubOutsourcingApi';
import type { VendorSubOutsourcing } from '@/types/vendorSubOutsourcing';

import {
    buildSubOutsourcingChainRows,
    buildVendorSubOutsourcingColumns,
    buildVendorSubOutsourcingPayload,
    resolveSubOutsourcingContractLabel,
} from './vendorSubOutsourcingPresentation';

interface VendorSubOutsourcingSectionProps {
    vendorId: number;
    canManageSubOutsourcing: boolean;
}

type SubOutsourcingFormFields = {
    contract_id: string;
    predecessor_id: string;
    sub_provider_name: string;
    identifier_type: string;
    identifier_value: string;
    country: string;
    ict_service_code: string;
    note: string;
};

function toFieldValue(value: string | number | null | undefined): string {
    return value === null || value === undefined ? '' : String(value);
}

function initialSubOutsourcingFields(entry?: VendorSubOutsourcing): SubOutsourcingFormFields {
    return {
        contract_id: toFieldValue(entry?.contract_id),
        predecessor_id: toFieldValue(entry?.predecessor_id),
        sub_provider_name: toFieldValue(entry?.sub_provider_name),
        identifier_type: toFieldValue(entry?.identifier_type),
        identifier_value: toFieldValue(entry?.identifier_value),
        country: toFieldValue(entry?.country),
        ict_service_code: toFieldValue(entry?.ict_service_code),
        note: toFieldValue(entry?.note),
    };
}

function toNullableInt(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed === '') {
        return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

export function VendorSubOutsourcingSection({
    vendorId,
    canManageSubOutsourcing,
}: VendorSubOutsourcingSectionProps) {
    const { t } = useTranslation(['vendors', 'common']);
    const queryClient = useQueryClient();

    const [formOpen, setFormOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<VendorSubOutsourcing | null>(null);
    const [fields, setFields] = useState<SubOutsourcingFormFields>(() => initialSubOutsourcingFields());
    const [sectionError, setSectionError] = useState<string | null>(null);

    const entriesQuery = useQuery({
        queryKey: ictRegisterKeys.vendorSubOutsourcing(vendorId),
        queryFn: () => vendorSubOutsourcingApi.getEntries(vendorId),
    });
    const contractsQuery = useQuery({
        queryKey: ictRegisterKeys.vendorContracts(vendorId),
        queryFn: () => vendorContractApi.getContracts(vendorId),
    });
    const closedListsQuery = useQuery({
        queryKey: ictRegisterKeys.closedLists(),
        queryFn: () => assetApi.getClosedLists(),
        staleTime: 5 * 60_000,
    });
    const taxonomyQuery = useQuery({
        queryKey: ictRegisterKeys.ictServiceTaxonomy(),
        queryFn: () => vendorSubOutsourcingApi.getIctServiceTaxonomy(),
        staleTime: 5 * 60_000,
    });

    const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
    const contracts = useMemo(() => contractsQuery.data ?? [], [contractsQuery.data]);

    // Real labels only: the contract reference when entered, the i18n'd
    // unknown label otherwise — never a raw `#<id>` fallback (guardrail).
    const contractLabelById = useMemo(() => {
        const labels = new Map<number, string>();
        for (const contract of contracts) {
            labels.set(contract.id, contract.contract_reference || t('common:fallbacks.unknown_contract'));
        }
        return labels;
    }, [contracts, t]);

    const listOptions = useMemo(() => {
        const lists = closedListsQuery.data ?? {};
        const toOptions = (name: string) =>
            (lists[name] ?? []).map((value) => ({ value: String(value), label: String(value) }));
        return {
            identifierTypes: toOptions('TypKodu'),
            countries: toOptions('ZemeList'),
            contracts: contracts
                .filter((contract) => !contract.is_archived || String(contract.id) === fields.contract_id)
                .map((contract) => ({
                    value: String(contract.id),
                    label: contract.contract_reference || t('common:fallbacks.unknown_contract'),
                })),
            ictServices: (taxonomyQuery.data ?? []).map((service) => ({
                value: service.code,
                label: `${service.code} — ${service.label}`,
            })),
        };
    }, [closedListsQuery.data, contracts, taxonomyQuery.data, fields.contract_id, t]);

    // Predecessors live on the SAME Contract; the entry can never precede itself.
    const predecessorOptions = useMemo(
        () =>
            entries
                .filter(
                    (entry) =>
                        String(entry.contract_id) === fields.contract_id &&
                        entry.id !== editingEntry?.id,
                )
                .map((entry) => ({
                    value: String(entry.id),
                    label: entry.sub_provider_name || t('common:fallbacks.unknown_sub_outsourcing'),
                })),
        [entries, fields.contract_id, editingEntry, t],
    );

    const refreshEntries = async () => {
        await queryClient.invalidateQueries({ queryKey: ictRegisterKeys.vendorSubOutsourcing(vendorId) });
    };

    const handleMutationError = (mutationError: unknown) => {
        logError('Vendor sub-outsourcing mutation failed:', mutationError);
        setSectionError(t('sub_outsourcing.errors.mutation_failed'));
    };

    const closeForm = () => {
        setFormOpen(false);
        setEditingEntry(null);
        setFields(initialSubOutsourcingFields());
    };

    const openCreateForm = () => {
        setEditingEntry(null);
        setFields(initialSubOutsourcingFields());
        setFormOpen(true);
    };

    const openEditForm = (entry: VendorSubOutsourcing) => {
        setEditingEntry(entry);
        setFields(initialSubOutsourcingFields(entry));
        setFormOpen(true);
    };

    const buildPayload = () =>
        buildVendorSubOutsourcingPayload({
            contract_id: toNullableInt(fields.contract_id),
            predecessor_id: toNullableInt(fields.predecessor_id),
            sub_provider_name: fields.sub_provider_name,
            identifier_type: fields.identifier_type,
            identifier_value: fields.identifier_value,
            country: fields.country,
            ict_service_code: fields.ict_service_code,
            note: fields.note,
        });

    const saveEntry = useMutation({
        mutationFn: () =>
            editingEntry
                ? vendorSubOutsourcingApi.updateEntry(vendorId, editingEntry.id, buildPayload())
                : vendorSubOutsourcingApi.createEntry(vendorId, buildPayload()),
        onSuccess: async () => {
            setSectionError(null);
            closeForm();
            await refreshEntries();
        },
        onError: handleMutationError,
    });

    const archiveEntry = useMutation({
        mutationFn: (entry: VendorSubOutsourcing) => vendorSubOutsourcingApi.archiveEntry(vendorId, entry.id),
        onSuccess: async () => {
            setSectionError(null);
            await refreshEntries();
        },
        onError: handleMutationError,
    });

    const restoreEntry = useMutation({
        mutationFn: (entry: VendorSubOutsourcing) => vendorSubOutsourcingApi.restoreEntry(vendorId, entry.id),
        onSuccess: async () => {
            setSectionError(null);
            await refreshEntries();
        },
        onError: handleMutationError,
    });

    // Columns are rebuilt each render (matching AssetsPage/ProcessesPage): the
    // handlers close over current state and the array is cheap, so memoizing it
    // would only add an exhaustive-deps burden without a real stability win.
    const columns = buildVendorSubOutsourcingColumns({
        t: (key, options) => t(key, options),
        getContractLabel: (entry) =>
            resolveSubOutsourcingContractLabel(
                entry,
                contractLabelById,
                t('common:fallbacks.unknown_contract'),
            ),
        onEdit: openEditForm,
        onArchive: (entry) => archiveEntry.mutate(entry),
        onRestore: (entry) => restoreEntry.mutate(entry),
    });

    // Full-depth chain render: group by Contract, indent by predecessor depth.
    const chainRows = useMemo(() => buildSubOutsourcingChainRows(entries), [entries]);

    const setField = (field: keyof SubOutsourcingFormFields) => (value: string) =>
        setFields((previous) => ({ ...previous, [field]: value }));

    const textInput = (
        field: keyof SubOutsourcingFormFields,
        label: string,
        props: Record<string, unknown> = {},
    ) => (
        <div className="vendor-field">
            <label className="vendor-label">{label}</label>
            <input
                type="text"
                data-testid={`vendor-sub-outsourcing-field-${field}`}
                value={fields[field]}
                onChange={(event) => setField(field)(event.target.value)}
                className="w-full glass rounded-xl px-3 py-2 text-sm text-white bg-transparent border border-white/10 focus:border-accent/50 outline-none"
                {...props}
            />
        </div>
    );

    const selectInput = (
        field: keyof SubOutsourcingFormFields,
        label: string,
        options: Array<{ value: string; label: string }>,
    ) => (
        <div className="vendor-field">
            <label className="vendor-label">{label}</label>
            <ThemedSelect
                value={fields[field]}
                onValueChange={setField(field)}
                options={options}
                allowEmpty
                emptyLabel={t('sub_outsourcing.form.not_set')}
                placeholder={t('sub_outsourcing.form.not_set')}
                triggerTestId={`vendor-sub-outsourcing-field-${field}`}
            />
        </div>
    );

    return (
        <div className="glass-card space-y-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                    <Network className="h-5 w-5 text-cyan-400" />
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                        {t('sub_outsourcing.title')}
                    </h2>
                </div>
                {canManageSubOutsourcing && !formOpen ? (
                    <button
                        type="button"
                        data-testid="vendor-sub-outsourcing-add"
                        onClick={openCreateForm}
                        className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-all flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        {t('sub_outsourcing.actions.add')}
                    </button>
                ) : null}
            </div>

            {sectionError ? (
                <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300">
                    {sectionError}
                </div>
            ) : null}

            {formOpen ? (
                <form
                    data-testid="vendor-sub-outsourcing-form"
                    className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        saveEntry.mutate();
                    }}
                >
                    <div className="vendor-form-grid">
                        {selectInput('contract_id', t('sub_outsourcing.form.contract'), listOptions.contracts)}
                        {selectInput(
                            'predecessor_id',
                            t('sub_outsourcing.form.predecessor'),
                            predecessorOptions,
                        )}
                        {textInput('sub_provider_name', t('sub_outsourcing.form.sub_provider_name'))}
                        {selectInput(
                            'identifier_type',
                            t('sub_outsourcing.form.identifier_type'),
                            listOptions.identifierTypes,
                        )}
                        {textInput('identifier_value', t('sub_outsourcing.form.identifier_value'))}
                        {selectInput('country', t('sub_outsourcing.form.country'), listOptions.countries)}
                        {selectInput(
                            'ict_service_code',
                            t('sub_outsourcing.form.ict_service'),
                            listOptions.ictServices,
                        )}
                    </div>
                    <div className="vendor-field">
                        <label className="vendor-label">{t('sub_outsourcing.form.note')}</label>
                        <textarea
                            data-testid="vendor-sub-outsourcing-field-note"
                            value={fields.note}
                            onChange={(event) => setField('note')(event.target.value)}
                            rows={2}
                            className="w-full glass rounded-xl px-3 py-2 text-sm text-white bg-transparent border border-white/10 focus:border-accent/50 outline-none"
                        />
                    </div>
                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            data-testid="vendor-sub-outsourcing-form-cancel"
                            onClick={closeForm}
                            className="px-4 py-2 glass rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                        >
                            <X className="h-4 w-4" />
                            {t('actions.cancel')}
                        </button>
                        <button
                            type="submit"
                            data-testid="vendor-sub-outsourcing-form-save"
                            disabled={saveEntry.isPending || fields.contract_id === ''}
                            className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            <Save className="h-4 w-4" />
                            {editingEntry ? t('actions.save') : t('sub_outsourcing.actions.create')}
                        </button>
                    </div>
                </form>
            ) : null}

            <SortableTable
                data={chainRows}
                columns={columns}
                keyExtractor={(row) => row.entry.id}
                emptyMessage={entriesQuery.isLoading ? undefined : t('sub_outsourcing.empty')}
            />
        </div>
    );
}
