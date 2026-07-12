import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Save, X } from 'lucide-react';

import { SortableTable } from '@/components/tables';
import { Field } from '@/components/ui/field';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { assetApi } from '@/services/assetApi';
import { logError } from '@/services/logger';
import { vendorContractApi } from '@/services/vendorContractApi';
import type { VendorContract } from '@/types/vendorContract';

import { buildVendorContractColumns, buildVendorContractPayload } from './vendorContractsPresentation';

interface VendorContractsSectionProps {
    vendorId: number;
    canManageContracts: boolean;
}

type ContractFormFields = {
    contract_reference: string;
    internal_contract_number: string;
    records_system: string;
    arrangement_type: string;
    main_contract: string;
    overarching_arrangement_reference: string;
    description: string;
    roi_scope: string;
    start_date: string;
    end_date: string;
    notice_period_entity_days: string;
    notice_period_provider_days: string;
    governing_law_country: string;
    annual_cost: string;
    currency: string;
    note: string;
};

function toFieldValue(value: string | number | null | undefined): string {
    return value === null || value === undefined ? '' : String(value);
}

function initialContractFields(contract?: VendorContract): ContractFormFields {
    return {
        contract_reference: toFieldValue(contract?.contract_reference),
        internal_contract_number: toFieldValue(contract?.internal_contract_number),
        records_system: toFieldValue(contract?.records_system),
        arrangement_type: toFieldValue(contract?.arrangement_type),
        main_contract: toFieldValue(contract?.main_contract),
        overarching_arrangement_reference: toFieldValue(contract?.overarching_arrangement_reference),
        description: toFieldValue(contract?.description),
        roi_scope: toFieldValue(contract?.roi_scope),
        start_date: toFieldValue(contract?.start_date),
        end_date: toFieldValue(contract?.end_date),
        notice_period_entity_days: toFieldValue(contract?.notice_period_entity_days),
        notice_period_provider_days: toFieldValue(contract?.notice_period_provider_days),
        governing_law_country: toFieldValue(contract?.governing_law_country),
        annual_cost: toFieldValue(contract?.annual_cost),
        currency: toFieldValue(contract?.currency),
        note: toFieldValue(contract?.note),
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

function toNullableNumber(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed === '') {
        return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

export function VendorContractsSection({ vendorId, canManageContracts }: VendorContractsSectionProps) {
    const { t, i18n } = useTranslation('vendors');
    const queryClient = useQueryClient();

    const [formOpen, setFormOpen] = useState(false);
    const [editingContract, setEditingContract] = useState<VendorContract | null>(null);
    const [fields, setFields] = useState<ContractFormFields>(() => initialContractFields());
    const [sectionError, setSectionError] = useState<string | null>(null);

    const contractsQuery = useQuery({
        queryKey: ictRegisterKeys.vendorContracts(vendorId),
        queryFn: () => vendorContractApi.getContracts(vendorId),
    });
    const closedListsQuery = useQuery({
        queryKey: ictRegisterKeys.closedLists(),
        queryFn: () => assetApi.getClosedLists(),
        staleTime: 5 * 60_000,
    });

    const listOptions = useMemo(() => {
        const lists = closedListsQuery.data ?? {};
        const toOptions = (name: string) =>
            (lists[name] ?? []).map((value) => ({ value: String(value), label: String(value) }));
        return {
            recordsSystems: toOptions('SystemEvidence'),
            arrangementTypes: toOptions('TypUjednani'),
            yesNo: toOptions('AnoNe'),
            currencies: toOptions('MenaList'),
        };
    }, [closedListsQuery.data]);

    const refreshContracts = async () => {
        await queryClient.invalidateQueries({ queryKey: ictRegisterKeys.vendorContracts(vendorId) });
    };

    const handleMutationError = (mutationError: unknown) => {
        logError('Vendor contract mutation failed:', mutationError);
        setSectionError(t('contracts.errors.mutation_failed'));
    };

    const closeForm = () => {
        setFormOpen(false);
        setEditingContract(null);
        setFields(initialContractFields());
    };

    const openCreateForm = () => {
        setEditingContract(null);
        setFields(initialContractFields());
        setFormOpen(true);
    };

    const openEditForm = (contract: VendorContract) => {
        setEditingContract(contract);
        setFields(initialContractFields(contract));
        setFormOpen(true);
    };

    const buildPayload = () =>
        buildVendorContractPayload({
            contract_reference: fields.contract_reference,
            internal_contract_number: fields.internal_contract_number,
            records_system: fields.records_system,
            arrangement_type: fields.arrangement_type,
            main_contract: fields.main_contract,
            overarching_arrangement_reference: fields.overarching_arrangement_reference,
            description: fields.description,
            roi_scope: fields.roi_scope,
            start_date: fields.start_date,
            end_date: fields.end_date,
            notice_period_entity_days: toNullableInt(fields.notice_period_entity_days),
            notice_period_provider_days: toNullableInt(fields.notice_period_provider_days),
            governing_law_country: fields.governing_law_country,
            annual_cost: toNullableNumber(fields.annual_cost),
            currency: fields.currency,
            note: fields.note,
        });

    const saveContract = useMutation({
        mutationFn: () =>
            editingContract
                ? vendorContractApi.updateContract(vendorId, editingContract.id, buildPayload())
                : vendorContractApi.createContract(vendorId, buildPayload()),
        onSuccess: async () => {
            setSectionError(null);
            closeForm();
            await refreshContracts();
        },
        onError: handleMutationError,
    });

    const archiveContract = useMutation({
        mutationFn: (contract: VendorContract) => vendorContractApi.archiveContract(vendorId, contract.id),
        onSuccess: async () => {
            setSectionError(null);
            await refreshContracts();
        },
        onError: handleMutationError,
    });

    const restoreContract = useMutation({
        mutationFn: (contract: VendorContract) => vendorContractApi.restoreContract(vendorId, contract.id),
        onSuccess: async () => {
            setSectionError(null);
            await refreshContracts();
        },
        onError: handleMutationError,
    });

    // Columns are rebuilt each render (matching AssetsPage/ProcessesPage): the
    // handlers close over current state and the array is cheap, so memoizing it
    // would only add an exhaustive-deps burden without a real stability win.
    const columns = buildVendorContractColumns({
        t: (key, options) => t(key, options),
        locale: i18n.language,
        onEdit: openEditForm,
        onArchive: (contract) => archiveContract.mutate(contract),
        onRestore: (contract) => restoreContract.mutate(contract),
    });

    const contracts = useMemo(() => contractsQuery.data ?? [], [contractsQuery.data]);
    // FR-P4-6: archived contracts are demoted into a dimmed, visually separated
    // section (the VendorLinkedEntitiesTab convention) rather than interleaved
    // with active rows. Formatting (locale-aware dates + right-aligned currency)
    // is applied by the shared column builder (FR-P5-4).
    const activeContracts = useMemo(
        () => contracts.filter((contract) => !contract.is_archived),
        [contracts],
    );
    const archivedContracts = useMemo(
        () => contracts.filter((contract) => contract.is_archived),
        [contracts],
    );

    const setField = (field: keyof ContractFormFields) => (value: string) =>
        setFields((previous) => ({ ...previous, [field]: value }));

    const contractInputClass =
        'w-full glass rounded-xl px-3 py-2 text-sm text-white bg-transparent border border-white/10 focus:border-accent/50 outline-none';

    const textInput = (field: keyof ContractFormFields, label: string, props: Record<string, unknown> = {}) => (
        <Field label={label} labelClassName="vendor-label" className="vendor-field space-y-0">
            {(control) => (
                <input
                    {...control}
                    type="text"
                    data-testid={`vendor-contract-field-${field}`}
                    value={fields[field]}
                    onChange={(event) => setField(field)(event.target.value)}
                    className={contractInputClass}
                    {...props}
                />
            )}
        </Field>
    );

    return (
        <div className="glass-card space-y-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-emerald-400" />
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                        {t('contracts.title')}
                    </h2>
                </div>
                {canManageContracts && !formOpen ? (
                    <button
                        type="button"
                        data-testid="vendor-contract-add"
                        onClick={openCreateForm}
                        className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-all flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        {t('contracts.actions.add')}
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
                    noValidate
                    data-testid="vendor-contract-form"
                    className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        saveContract.mutate();
                    }}
                >
                    {closedListsQuery.isError ? (
                        <div
                            role="status"
                            className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-200"
                        >
                            <span>{t('contracts.form.lists_failed')}</span>
                            <button
                                type="button"
                                onClick={() => void closedListsQuery.refetch()}
                                className="shrink-0 rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-widest transition-colors hover:bg-white/10"
                            >
                                {t('actions.refresh')}
                            </button>
                        </div>
                    ) : null}
                    <div className="vendor-form-grid">
                        {textInput('contract_reference', t('contracts.form.contract_reference'))}
                        {textInput('internal_contract_number', t('contracts.form.internal_contract_number'))}
                        <Field
                            label={t('contracts.form.records_system')}
                            labelClassName="vendor-label"
                            className="vendor-field space-y-0"
                        >
                            {(control) => (
                                <ThemedSelect
                                    {...control}
                                    value={fields.records_system}
                                    onValueChange={setField('records_system')}
                                    options={listOptions.recordsSystems}
                                    allowEmpty
                                    emptyLabel={t('contracts.form.not_set')}
                                    placeholder={t('contracts.form.not_set')}
                                    triggerTestId="vendor-contract-field-records_system"
                                />
                            )}
                        </Field>
                        <Field
                            label={t('contracts.form.arrangement_type')}
                            labelClassName="vendor-label"
                            className="vendor-field space-y-0"
                        >
                            {(control) => (
                                <ThemedSelect
                                    {...control}
                                    value={fields.arrangement_type}
                                    onValueChange={setField('arrangement_type')}
                                    options={listOptions.arrangementTypes}
                                    allowEmpty
                                    emptyLabel={t('contracts.form.not_set')}
                                    placeholder={t('contracts.form.not_set')}
                                    triggerTestId="vendor-contract-field-arrangement_type"
                                />
                            )}
                        </Field>
                        <Field
                            label={t('contracts.form.main_contract')}
                            labelClassName="vendor-label"
                            className="vendor-field space-y-0"
                        >
                            {(control) => (
                                <ThemedSelect
                                    {...control}
                                    value={fields.main_contract}
                                    onValueChange={setField('main_contract')}
                                    options={listOptions.yesNo}
                                    allowEmpty
                                    emptyLabel={t('contracts.form.not_set')}
                                    placeholder={t('contracts.form.not_set')}
                                    triggerTestId="vendor-contract-field-main_contract"
                                />
                            )}
                        </Field>
                        <Field
                            label={t('contracts.form.roi_scope')}
                            labelClassName="vendor-label"
                            className="vendor-field space-y-0"
                        >
                            {(control) => (
                                <ThemedSelect
                                    {...control}
                                    value={fields.roi_scope}
                                    onValueChange={setField('roi_scope')}
                                    options={listOptions.yesNo}
                                    allowEmpty
                                    emptyLabel={t('contracts.form.not_set')}
                                    placeholder={t('contracts.form.not_set')}
                                    triggerTestId="vendor-contract-field-roi_scope"
                                />
                            )}
                        </Field>
                        {textInput('overarching_arrangement_reference', t('contracts.form.overarching_arrangement_reference'))}
                        {textInput('start_date', t('contracts.form.start_date'), { type: 'date' })}
                        {textInput('end_date', t('contracts.form.end_date'), { type: 'date' })}
                        {textInput('notice_period_entity_days', t('contracts.form.notice_period_entity_days'), {
                            type: 'number',
                            min: 0,
                        })}
                        {textInput('notice_period_provider_days', t('contracts.form.notice_period_provider_days'), {
                            type: 'number',
                            min: 0,
                        })}
                        {textInput('governing_law_country', t('contracts.form.governing_law_country'), {
                            maxLength: 2,
                        })}
                        {textInput('annual_cost', t('contracts.form.annual_cost'), {
                            type: 'number',
                            min: 0,
                            step: '0.01',
                        })}
                        <Field
                            label={t('contracts.form.currency')}
                            labelClassName="vendor-label"
                            className="vendor-field space-y-0"
                        >
                            {(control) => (
                                <ThemedSelect
                                    {...control}
                                    value={fields.currency}
                                    onValueChange={setField('currency')}
                                    options={listOptions.currencies}
                                    allowEmpty
                                    emptyLabel={t('contracts.form.not_set')}
                                    placeholder={t('contracts.form.not_set')}
                                    triggerTestId="vendor-contract-field-currency"
                                />
                            )}
                        </Field>
                    </div>
                    <Field
                        label={t('contracts.form.description')}
                        labelClassName="vendor-label"
                        className="vendor-field space-y-0"
                    >
                        {(control) => (
                            <textarea
                                {...control}
                                data-testid="vendor-contract-field-description"
                                value={fields.description}
                                onChange={(event) => setField('description')(event.target.value)}
                                rows={2}
                                className={contractInputClass}
                            />
                        )}
                    </Field>
                    <Field
                        label={t('contracts.form.note')}
                        labelClassName="vendor-label"
                        className="vendor-field space-y-0"
                    >
                        {(control) => (
                            <textarea
                                {...control}
                                data-testid="vendor-contract-field-note"
                                value={fields.note}
                                onChange={(event) => setField('note')(event.target.value)}
                                rows={2}
                                className={contractInputClass}
                            />
                        )}
                    </Field>
                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            data-testid="vendor-contract-form-cancel"
                            onClick={closeForm}
                            className="px-4 py-2 glass rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                        >
                            <X className="h-4 w-4" />
                            {t('actions.cancel')}
                        </button>
                        <button
                            type="submit"
                            data-testid="vendor-contract-form-save"
                            disabled={saveContract.isPending}
                            className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            <Save className="h-4 w-4" />
                            {editingContract ? t('actions.save') : t('contracts.actions.create')}
                        </button>
                    </div>
                </form>
            ) : null}

            {/* Active contracts carry #61's loading/error/empty contract. The
                gate keeps the empty state honest: it only shows when there are
                truly no contracts (not when every contract is archived). */}
            {activeContracts.length > 0 || contracts.length === 0 ? (
                <SortableTable
                    data={activeContracts}
                    columns={columns}
                    keyExtractor={(contract) => contract.id}
                    isLoading={contractsQuery.isLoading}
                    isError={contractsQuery.isError}
                    onRetry={() => void contractsQuery.refetch()}
                    emptyMessage={t('contracts.empty')}
                />
            ) : null}

            {archivedContracts.length > 0 ? (
                <section
                    data-testid="vendor-contracts-archived"
                    aria-label={t('contracts.archived_heading', { count: archivedContracts.length })}
                    className="space-y-3"
                >
                    <h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
                        <span className="h-2 w-2 rounded-full bg-slate-600" aria-hidden="true" />
                        {t('contracts.archived_heading', { count: archivedContracts.length })}
                    </h3>
                    <div className="opacity-60 transition-opacity hover:opacity-100">
                        <SortableTable
                            data={archivedContracts}
                            columns={columns}
                            keyExtractor={(contract) => contract.id}
                        />
                    </div>
                </section>
            ) : null}
        </div>
    );
}
