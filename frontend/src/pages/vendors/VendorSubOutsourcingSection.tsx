import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Network, Plus, Save, X } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SortableTable } from '@/components/tables';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { closedListOptions } from '@/lib/closedListLabels';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { useFeedback } from '@/hooks/useFeedback';
import { assetApi } from '@/services/assetApi';
import { logError } from '@/services/logger';
import { vendorContractApi } from '@/services/vendorContractApi';
import { vendorSubOutsourcingApi } from '@/services/vendorSubOutsourcingApi';
import { isProcessApprovalQueuedResponse } from '@/types/process';
import type { VendorSubOutsourcing } from '@/types/vendorSubOutsourcing';

import { VendorSubOutsourcingChainTable } from './VendorSubOutsourcingChainTable';
import {
    buildSubOutsourcingChainRows,
    buildVendorSubOutsourcingColumns,
    buildVendorSubOutsourcingPayload,
    groupSubOutsourcingChainRows,
    resolveSubOutsourcingContractLabel,
} from './vendorSubOutsourcingPresentation';
import { ErrorState } from '@/components/ui/state';

interface VendorSubOutsourcingSectionProps {
    vendorId: number;
    canManageSubOutsourcing: boolean;
    /**
     * Backend-declared `protected_change_requires_approval` capability from
     * the Vendor read payload (ADR-016, #101). It is the ONLY switch between
     * the direct create/edit/archive path and the governed reason-then-queue
     * path — no local re-derivation. Restore stays direct by design.
     */
    protectedChangeRequiresApproval: boolean;
}

type SubOutsourcingFormFields = {
    contract_id: string;
    predecessor_id: string;
    sub_provider_name: string;
    person_type: string;
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
        person_type: toFieldValue(entry?.person_type),
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
    protectedChangeRequiresApproval,
}: VendorSubOutsourcingSectionProps) {
    const { t } = useTranslation(['vendors', 'common']);
    // D12 / PM-2: approval-routed changes keep the user on this page with
    // the pending notice plus a success toast.
    const announceApprovalQueued = useApprovalQueued();
    // D9: direct (non-approval) outcomes are confirmed with a success toast.
    const feedback = useFeedback();
    const entryName = (entry: VendorSubOutsourcing) =>
        entry.sub_provider_name || t('common:fallbacks.unknown_sub_outsourcing');
    const queryClient = useQueryClient();

    const [formOpen, setFormOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<VendorSubOutsourcing | null>(null);
    const [fields, setFields] = useState<SubOutsourcingFormFields>(() => initialSubOutsourcingFields());
    const [requestReason, setRequestReason] = useState('');
    const [requestReasonError, setRequestReasonError] = useState<string | null>(null);
    const requestReasonRef = useRef<HTMLTextAreaElement>(null);
    const [pendingArchive, setPendingArchive] = useState<VendorSubOutsourcing | null>(null);
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
        // GAP-C-09 / PM-4: translated labels, the raw workbook codes stay the values.
        const toOptions = (name: string) => closedListOptions(t, lists, name);
        const identifierTypes = toOptions('TypKodu');
        if (
            fields.identifier_type &&
            !identifierTypes.some((option) => option.value === fields.identifier_type)
        ) {
            identifierTypes.unshift({ value: fields.identifier_type, label: fields.identifier_type });
        }
        return {
            personTypes: toOptions('TypOsoby'),
            identifierTypes,
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
    }, [closedListsQuery.data, contracts, taxonomyQuery.data, fields.contract_id, fields.identifier_type, t]);

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
        setRequestReason('');
        setRequestReasonError(null);
    };

    const openCreateForm = () => {
        setEditingEntry(null);
        setFields(initialSubOutsourcingFields());
        setRequestReason('');
        setRequestReasonError(null);
        setFormOpen(true);
    };

    const openEditForm = (entry: VendorSubOutsourcing) => {
        setEditingEntry(entry);
        setFields(initialSubOutsourcingFields(entry));
        setRequestReason('');
        setRequestReasonError(null);
        setFormOpen(true);
    };

    const buildPayload = () =>
        buildVendorSubOutsourcingPayload({
            contract_id: toNullableInt(fields.contract_id),
            predecessor_id: toNullableInt(fields.predecessor_id),
            sub_provider_name: fields.sub_provider_name,
            person_type: fields.person_type,
            identifier_type: fields.identifier_type,
            identifier_value: fields.identifier_value,
            country: fields.country,
            ict_service_code: fields.ict_service_code,
            note: fields.note,
        });

    const saveEntry = useMutation({
        mutationFn: () =>
            editingEntry
                ? vendorSubOutsourcingApi.updateEntry(vendorId, editingEntry.id, buildPayload(), requestReason)
                : vendorSubOutsourcingApi.createEntry(vendorId, buildPayload(), requestReason),
        onSuccess: async (result) => {
            const wasEdit = editingEntry !== null;
            setSectionError(null);
            closeForm();
            if (isProcessApprovalQueuedResponse(result)) {
                announceApprovalQueued({ approvalId: result.approval_id });
                return;
            }
            feedback.success({
                title: t(wasEdit ? 'common:success.updated' : 'common:success.created'),
                description: result.sub_provider_name ?? undefined,
            });
            await refreshEntries();
        },
        onError: handleMutationError,
    });

    const archiveEntry = useMutation({
        mutationFn: ({ entry, reason }: { entry: VendorSubOutsourcing; reason: string }) =>
            vendorSubOutsourcingApi.archiveEntry(vendorId, entry.id, reason),
        onSuccess: async (result, { entry }) => {
            setSectionError(null);
            setPendingArchive(null);
            if (isProcessApprovalQueuedResponse(result)) {
                announceApprovalQueued({ approvalId: result.approval_id });
                return;
            }
            feedback.success({ title: t('common:outcome.archived', { name: entryName(entry) }) });
            await refreshEntries();
        },
        onError: handleMutationError,
    });

    const restoreEntry = useMutation({
        mutationFn: (entry: VendorSubOutsourcing) => vendorSubOutsourcingApi.restoreEntry(vendorId, entry.id),
        onSuccess: async (_result, entry) => {
            setSectionError(null);
            feedback.success({ title: t('common:outcome.restored', { name: entryName(entry) }) });
            await refreshEntries();
        },
        onError: handleMutationError,
    });

    // Real contract label (never a raw `#id`) — shared by the per-row Contract
    // column and the per-Contract chain-group header (FR-P4-7).
    const getContractLabel = useCallback(
        (entry: VendorSubOutsourcing) =>
            resolveSubOutsourcingContractLabel(
                entry,
                contractLabelById,
                t('common:fallbacks.unknown_contract'),
            ),
        [contractLabelById, t],
    );

    // Columns are rebuilt each render (matching AssetsPage/ProcessesPage): the
    // handlers close over current state and the array is cheap, so memoizing it
    // would only add an exhaustive-deps burden without a real stability win.
    const columns = buildVendorSubOutsourcingColumns({
        t: (key, options) => t(key, options),
        getContractLabel,
        onEdit: openEditForm,
        // GAP-C-06 / D10: every archive is confirmed; the reason is required
        // only when the change is routed through approval (PM-1).
        onArchive: (entry) => {
            setSectionError(null);
            setPendingArchive(entry);
        },
        onRestore: (entry) => restoreEntry.mutate(entry),
    });

    // Full-depth chain render: group by Contract, indent by predecessor depth.
    const chainRows = useMemo(() => buildSubOutsourcingChainRows(entries), [entries]);
    // FR-P4-7: fold the ordered rows into per-Contract, collapsible groups.
    const chainGroups = useMemo(
        () => groupSubOutsourcingChainRows(chainRows, getContractLabel),
        [chainRows, getContractLabel],
    );

    const setField = (field: keyof SubOutsourcingFormFields) => (value: string) =>
        setFields((previous) => ({ ...previous, [field]: value }));

    // AX-04: every control is named by its visible label through `Field`.
    const textInput = (
        field: keyof SubOutsourcingFormFields,
        label: string,
        props: Record<string, unknown> = {},
    ) => (
        <Field label={label}>
            {(control) => (
                <Input
                    {...control}
                    type="text"
                    data-testid={`vendor-sub-outsourcing-field-${field}`}
                    value={fields[field]}
                    onChange={(event) => setField(field)(event.target.value)}
                    {...props}
                />
            )}
        </Field>
    );

    const selectInput = (
        field: keyof SubOutsourcingFormFields,
        label: string,
        options: Array<{ value: string; label: string }>,
        required = false,
    ) => (
        <Field label={label} required={required}>
            {(control) => (
                <ThemedSelect
                    {...control}
                    value={fields[field]}
                    onValueChange={setField(field)}
                    options={options}
                    allowEmpty
                    emptyLabel={t('sub_outsourcing.form.not_set')}
                    placeholder={t('sub_outsourcing.form.not_set')}
                    triggerTestId={`vendor-sub-outsourcing-field-${field}`}
                />
            )}
        </Field>
    );

    return (
        <Card as="section" className="space-y-5">
            <CardHeader
                icon={Network}
                title={t('sub_outsourcing.title')}
                className="mb-0"
                actions={canManageSubOutsourcing && !formOpen ? (
                    <Button variant="accent" data-testid="vendor-sub-outsourcing-add" onClick={openCreateForm}>
                        <Plus aria-hidden="true" />
                        {t('sub_outsourcing.actions.add')}
                    </Button>
                ) : null}
            />

            {/* After-close visibility only: while the archive dialog is open the
                error is announced inside it (#101 P2 — the shell traps focus). */}
            {sectionError && pendingArchive === null ? (
                <InlineMessage tone="danger">{sectionError}</InlineMessage>
            ) : null}

            {formOpen ? (
                <form
                    noValidate
                    data-testid="vendor-sub-outsourcing-form"
                    className="space-y-4 rounded-xl border border-border bg-nested p-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (protectedChangeRequiresApproval && !requestReason.trim()) {
                            setRequestReasonError(t('errors.request_reason_required'));
                            requestReasonRef.current?.focus();
                            return;
                        }
                        setRequestReasonError(null);
                        saveEntry.mutate();
                    }}
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {selectInput('contract_id', t('sub_outsourcing.form.contract'), listOptions.contracts, true)}
                        {selectInput(
                            'predecessor_id',
                            t('sub_outsourcing.form.predecessor'),
                            predecessorOptions,
                        )}
                        {textInput('sub_provider_name', t('sub_outsourcing.form.sub_provider_name'))}
                        {selectInput(
                            'person_type',
                            t('sub_outsourcing.form.person_type'),
                            listOptions.personTypes,
                        )}
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
                    <Field label={t('sub_outsourcing.form.note')}>
                        {(control) => (
                            <Textarea
                                {...control}
                                data-testid="vendor-sub-outsourcing-field-note"
                                value={fields.note}
                                onChange={(event) => setField('note')(event.target.value)}
                                rows={2}
                            />
                        )}
                    </Field>
                    {protectedChangeRequiresApproval ? (
                        <Field
                            label={t('form.request_reason')}
                            required
                            help={t('form.request_reason_help')}
                            error={requestReasonError}
                        >
                            {(control) => (
                                <Textarea
                                    {...control}
                                    ref={requestReasonRef}
                                    data-testid="vendor-sub-outsourcing-request-reason"
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
                        <Button variant="outline" data-testid="vendor-sub-outsourcing-form-cancel" onClick={closeForm}>
                            <X aria-hidden="true" />
                            {t('actions.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            variant="accent"
                            data-testid="vendor-sub-outsourcing-form-save"
                            disabled={saveEntry.isPending || fields.contract_id === ''}
                        >
                            <Save aria-hidden="true" />
                            {editingEntry ? t('actions.save') : t('sub_outsourcing.actions.create')}
                        </Button>
                    </div>
                </form>
            ) : null}

            {/* Loading / error / empty keep #61's SortableTable contract verbatim;
                only the populated state switches to the grouped, collapsible render. */}
            {entriesQuery.isError && entriesQuery.data ? (
                // GAP-C-11: a refetch error keeps the grouped data and adds a stale banner.
                <ErrorState
                    variant="banner"
                    onRetry={() => void entriesQuery.refetch()}
                    isRetrying={entriesQuery.isFetching}
                    className="mb-3"
                />
            ) : null}
            {entriesQuery.isLoading || (entriesQuery.isError && !entriesQuery.data) || chainGroups.length === 0 ? (
                <SortableTable
                    data={chainRows}
                    columns={columns}
                    keyExtractor={(row) => row.entry.id}
                    isLoading={entriesQuery.isLoading}
                    isError={entriesQuery.isError && !entriesQuery.data}
                    onRetry={() => void entriesQuery.refetch()}
                    emptyMessage={t('sub_outsourcing.empty')}
                />
            ) : (
                <VendorSubOutsourcingChainTable groups={chainGroups} columns={columns} />
            )}

            <ConfirmDialog
                isOpen={pendingArchive !== null}
                onClose={() => setPendingArchive(null)}
                onConfirm={(reason) => {
                    if (pendingArchive) {
                        archiveEntry.mutate({ entry: pendingArchive, reason: reason?.trim() ?? '' });
                    }
                }}
                intent="archive"
                title={t('sub_outsourcing.actions.archive')}
                message={t('sub_outsourcing.archive_confirm', {
                    name: pendingArchive?.sub_provider_name || t('common:fallbacks.unknown_sub_outsourcing'),
                })}
                confirmLabel={t('sub_outsourcing.actions.archive')}
                isLoading={archiveEntry.isPending}
                errorText={sectionError}
                reason={protectedChangeRequiresApproval ? 'required' : 'optional'}
                reasonLabel={t('form.request_reason')}
                reasonPlaceholder={t('form.request_reason_help')}
            />
        </Card>
    );
}
