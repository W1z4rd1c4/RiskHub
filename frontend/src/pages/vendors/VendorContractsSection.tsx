import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Save, X } from 'lucide-react';

import { SortableTable } from '@/components/tables';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TableErrorState, resolveTableErrorContract } from '@/components/tables/tableError';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useFormat, useTranslation } from '@/i18n/hooks';
import { closedListOptions } from '@/lib/closedListLabels';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { assetApi } from '@/services/assetApi';
import { logError } from '@/services/logger';
import { vendorContractApi } from '@/services/vendorContractApi';
import type { VendorContract } from '@/types/vendorContract';
import { isProcessApprovalQueuedResponse } from '@/types/process';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { useFeedback } from '@/hooks/useFeedback';

import { buildVendorContractColumns, buildVendorContractPayload } from './vendorContractsPresentation';

interface VendorContractsSectionProps {
    vendorId: number;
    canManageContracts: boolean;
    protectedChangeRequiresApproval: boolean;
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

export function VendorContractsSection({
    vendorId,
    canManageContracts,
    protectedChangeRequiresApproval,
}: VendorContractsSectionProps) {
    const { t } = useTranslation('vendors');
    const format = useFormat();
    // D12 / PM-2: approval-routed changes keep the user on this page with
    // the pending notice plus a success toast.
    const announceApprovalQueued = useApprovalQueued();
    // D9: direct (non-approval) outcomes are confirmed with a success toast.
    const feedback = useFeedback();
    const contractName = (contract: VendorContract) =>
        contract.contract_reference || t('common:fallbacks.unknown_contract');
    const queryClient = useQueryClient();

    const [formOpen, setFormOpen] = useState(false);
    const [editingContract, setEditingContract] = useState<VendorContract | null>(null);
    const [fields, setFields] = useState<ContractFormFields>(() => initialContractFields());
    const [requestReason, setRequestReason] = useState('');
    const [requestReasonError, setRequestReasonError] = useState<string | null>(null);
    const requestReasonRef = useRef<HTMLTextAreaElement>(null);
    const [pendingArchive, setPendingArchive] = useState<VendorContract | null>(null);
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
        // GAP-C-09 / PM-4: translated labels, the raw workbook codes stay the values.
        const toOptions = (name: string) => closedListOptions(t, lists, name);
        return {
            recordsSystems: toOptions('SystemEvidence'),
            arrangementTypes: toOptions('TypUjednani'),
            yesNo: toOptions('AnoNe'),
            currencies: toOptions('MenaList'),
        };
    }, [closedListsQuery.data, t]);

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
        setRequestReason('');
        setRequestReasonError(null);
    };

    const openCreateForm = () => {
        setEditingContract(null);
        setFields(initialContractFields());
        setRequestReason('');
        setRequestReasonError(null);
        setFormOpen(true);
    };

    const openEditForm = (contract: VendorContract) => {
        setEditingContract(contract);
        setFields(initialContractFields(contract));
        setRequestReason('');
        setRequestReasonError(null);
        setFormOpen(true);
    };

    const buildPayload = () => ({
        ...buildVendorContractPayload({
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
        }),
        ...(requestReason.trim() ? { request_reason: requestReason.trim() } : {}),
    });

    const saveContract = useMutation({
        mutationFn: () =>
            editingContract
                ? vendorContractApi.updateContract(vendorId, editingContract.id, buildPayload())
                : vendorContractApi.createContract(vendorId, buildPayload()),
        onSuccess: async (result) => {
            const wasEdit = editingContract !== null;
            setSectionError(null);
            closeForm();
            if (isProcessApprovalQueuedResponse(result)) {
                announceApprovalQueued({ approvalId: result.approval_id });
                return;
            }
            feedback.success({
                title: t(wasEdit ? 'common:success.updated' : 'common:success.created'),
                description: result.contract_reference ?? undefined,
            });
            await refreshContracts();
        },
        onError: handleMutationError,
    });

    const archiveContract = useMutation({
        mutationFn: ({ contract, reason }: { contract: VendorContract; reason: string }) =>
            vendorContractApi.archiveContract(vendorId, contract.id, reason),
        onSuccess: async (result, { contract }) => {
            setSectionError(null);
            setPendingArchive(null);
            if (isProcessApprovalQueuedResponse(result)) {
                announceApprovalQueued({ approvalId: result.approval_id });
                return;
            }
            feedback.success({ title: t('common:outcome.archived', { name: contractName(contract) }) });
            await refreshContracts();
        },
        onError: handleMutationError,
    });

    const restoreContract = useMutation({
        mutationFn: (contract: VendorContract) => vendorContractApi.restoreContract(vendorId, contract.id),
        onSuccess: async (_result, contract) => {
            setSectionError(null);
            feedback.success({ title: t('common:outcome.restored', { name: contractName(contract) }) });
            await refreshContracts();
        },
        onError: handleMutationError,
    });

    // Columns are rebuilt each render (matching AssetsPage/ProcessesPage): the
    // handlers close over current state and the array is cheap, so memoizing it
    // would only add an exhaustive-deps burden without a real stability win.
    const columns = buildVendorContractColumns({
        t: (key, options) => t(key, options),
        locale: format.locale,
        onEdit: openEditForm,
        // GAP-C-06 / D10: every archive is confirmed; the reason is required
        // only when the change is routed through approval (PM-1).
        onArchive: (contract) => {
            setSectionError(null);
            setPendingArchive(contract);
        },
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

    // N17 (R3b): ONE shared error contract spanning BOTH the active and archived
    // sections. When every cached contract is archived, the active/error-aware table is
    // gated out (below), so without this a failed refetch would surface nowhere. The
    // active table still owns the first-load "replace" block (isError with no data); this
    // hoisted banner owns the stale-refetch overlay, so exactly one banner surfaces
    // regardless of which table is showing — and the stale rows are never blanked.
    const contractsErrorContract = resolveTableErrorContract({
        isError: contractsQuery.isError,
        hasData: contracts.length > 0,
    });

    const setField = (field: keyof ContractFormFields) => (value: string) =>
        setFields((previous) => ({ ...previous, [field]: value }));

    const textInput = (field: keyof ContractFormFields, label: string, props: Record<string, unknown> = {}) => (
        <Field label={label}>
            {(control) => (
                <Input
                    {...control}
                    type="text"
                    data-testid={`vendor-contract-field-${field}`}
                    value={fields[field]}
                    onChange={(event) => setField(field)(event.target.value)}
                    {...props}
                />
            )}
        </Field>
    );

    return (
        <Card as="section" className="space-y-5">
            <CardHeader
                icon={FileText}
                title={t('contracts.title')}
                className="mb-0"
                actions={canManageContracts && !formOpen ? (
                    <Button variant="accent" data-testid="vendor-contract-add" onClick={openCreateForm}>
                        <Plus aria-hidden="true" />
                        {t('contracts.actions.add')}
                    </Button>
                ) : null}
            />

            {/* While the archive dialog is open, its focus trap owns the
                rejected-mutation alert; after close, the page banner owns it. */}
            {sectionError && pendingArchive === null ? (
                <InlineMessage tone="danger">{sectionError}</InlineMessage>
            ) : null}

            {formOpen ? (
                <form
                    noValidate
                    data-testid="vendor-contract-form"
                    className="space-y-4 rounded-xl border border-border bg-nested p-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (protectedChangeRequiresApproval && !requestReason.trim()) {
                            setRequestReasonError(t('errors.request_reason_required'));
                            requestReasonRef.current?.focus();
                            return;
                        }
                        setRequestReasonError(null);
                        saveContract.mutate();
                    }}
                >
                    {closedListsQuery.isError ? (
                        <InlineMessage
                            tone="warning"
                            action={(
                                <Button type="button" variant="outline" size="compact" onClick={() => void closedListsQuery.refetch()}>
                                    {t('actions.refresh')}
                                </Button>
                            )}
                        >
                            {t('contracts.form.lists_failed')}
                        </InlineMessage>
                    ) : null}
                    {/* GAP-C-08: the request-reason error renders once, at its field. */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {textInput('contract_reference', t('contracts.form.contract_reference'))}
                        {textInput('internal_contract_number', t('contracts.form.internal_contract_number'))}
                        <Field label={t('contracts.form.records_system')}>
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
                    <Field label={t('contracts.form.description')}>
                        {(control) => (
                            <Textarea
                                {...control}
                                data-testid="vendor-contract-field-description"
                                value={fields.description}
                                onChange={(event) => setField('description')(event.target.value)}
                                rows={2}
                            />
                        )}
                    </Field>
                    <Field label={t('contracts.form.note')}>
                        {(control) => (
                            <Textarea
                                {...control}
                                data-testid="vendor-contract-field-note"
                                value={fields.note}
                                onChange={(event) => setField('note')(event.target.value)}
                                rows={2}
                            />
                        )}
                    </Field>
                    {protectedChangeRequiresApproval ? (
                        <Field
                            id="vendor-contract-request-reason"
                            label={t('form.request_reason')}
                            required
                            help={t('form.request_reason_help')}
                            error={requestReasonError}
                        >
                            {(control) => (
                                <Textarea
                                    {...control}
                                    ref={requestReasonRef}
                                    data-testid="vendor-contract-request-reason"
                                    value={requestReason}
                                    onChange={(event) => {
                                        setRequestReason(event.target.value);
                                        setRequestReasonError(null);
                                    }}
                                    rows={2}
                                    required
                                />
                            )}
                        </Field>
                    ) : null}
                    <div className="flex items-center justify-end gap-3">
                        <Button variant="outline" data-testid="vendor-contract-form-cancel" onClick={closeForm}>
                            <X aria-hidden="true" />
                            {t('actions.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            variant="accent"
                            data-testid="vendor-contract-form-save"
                            disabled={saveContract.isPending}
                        >
                            <Save aria-hidden="true" />
                            {editingContract ? t('actions.save') : t('contracts.actions.create')}
                        </Button>
                    </div>
                </form>
            ) : null}

            {/* N17 (R3b): the shared stale-refetch banner sits above BOTH tables so a
                failed refetch surfaces even when the active table is gated out (every
                contract archived). The active table keeps only the first-load "replace"
                block, so the two never double up. */}
            {contractsErrorContract.showErrorBanner ? (
                <TableErrorState variant="banner" onRetry={() => void contractsQuery.refetch()} />
            ) : null}

            {/* Active contracts carry #61's loading + first-load-error + empty contract.
                The gate keeps the empty state honest: it only shows when there are truly
                no contracts (not when every contract is archived). The stale-refetch
                overlay is owned by the shared banner above, so `isError` here is scoped to
                the replace case (a first-load failure with no last-good data). */}
            {activeContracts.length > 0 || contracts.length === 0 ? (
                <SortableTable
                    data={activeContracts}
                    columns={columns}
                    keyExtractor={(contract) => contract.id}
                    isLoading={contractsQuery.isLoading}
                    isError={contractsErrorContract.showErrorBlock}
                    onRetry={() => void contractsQuery.refetch()}
                    emptyMessage={t('contracts.empty')}
                    horizontalRegionLabel={t('contracts.active_table_label')}
                />
            ) : null}

            {archivedContracts.length > 0 ? (
                <section
                    data-testid="vendor-contracts-archived"
                    aria-label={t('contracts.archived_heading', { count: archivedContracts.length })}
                    className="space-y-3"
                >
                    <h3 className="text-eyebrow flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground" aria-hidden="true" />
                        {t('contracts.archived_heading', { count: archivedContracts.length })}
                    </h3>
                    {/* GAP-D-14: no group opacity; each row carries its own Archived status badge. */}
                    <SortableTable
                        data={archivedContracts}
                        columns={columns}
                        keyExtractor={(contract) => contract.id}
                        horizontalRegionLabel={t('contracts.archived_table_label')}
                    />
                </section>
            ) : null}

            <ConfirmDialog
                isOpen={pendingArchive !== null}
                onClose={() => setPendingArchive(null)}
                onConfirm={(reason) => {
                    if (pendingArchive) {
                        archiveContract.mutate({ contract: pendingArchive, reason: reason?.trim() ?? '' });
                    }
                }}
                intent="archive"
                title={t('contracts.actions.archive')}
                message={t('contracts.archive_confirm', {
                    reference: pendingArchive?.contract_reference ?? '—',
                })}
                confirmLabel={t('contracts.actions.archive')}
                isLoading={archiveContract.isPending}
                errorText={sectionError}
                reason={protectedChangeRequiresApproval ? 'required' : 'optional'}
                reasonLabel={t('form.request_reason')}
                reasonPlaceholder={t('form.request_reason_help')}
            />
        </Card>
    );
}
