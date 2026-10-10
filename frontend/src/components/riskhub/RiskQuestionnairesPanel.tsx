import { useCallback, useEffect, useState } from 'react';
import { FileText, Send } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { translateUiMessage, useFormat, useTranslation } from '@/i18n/hooks';
import { departmentApi } from '@/services/departmentApi';
import type { RiskStatus } from '@/types/risk';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InlineMessage } from '@/components/ui/inline-message';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { logError } from '@/services/logger';
import { riskHubCapabilityEnabled, useRiskHubCapabilities } from './useRiskHubCapabilities';
import {
    type BatchSendResponse,
    useRiskQuestionnaireBatchSend,
    useRiskQuestionnaireFilters,
    useRiskQuestionnaireRisks,
    useRiskQuestionnaireSelection,
} from './riskQuestionnairePanelState';

export function RiskQuestionnairesPanel() {
    const { t } = useTranslation('admin');
    const format = useFormat();
    const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [result, setResult] = useState<BatchSendResponse | null>(null);
    // GAP-B-05 / D10: the outbound batch send is confirmed first (send intent,
    // count-aware title); a failure stays inside the open confirmation.
    const [isSendConfirmOpen, setIsSendConfirmOpen] = useState(false);
    const { data: riskHubCapabilities } = useRiskHubCapabilities();
    const canBatchSend = riskHubCapabilityEnabled(riskHubCapabilities?.questionnaires, 'can_batch_send');
    const {
        category,
        departmentId,
        filters,
        process,
        setCategory,
        setDepartmentId,
        setProcess,
        setStatus,
        status,
    } = useRiskQuestionnaireFilters();
    const { fetchRisks, loadFailed, loading, risks } = useRiskQuestionnaireRisks(filters);
    const reloadRisks = useCallback(() => fetchRisks(() => {
        setErrorKey(null);
        setResult(null);
    }), [fetchRisks]);
    const {
        allVisibleSelected,
        selectedIds,
        selectAll,
        setSelectedIds,
        toggleAllVisible,
        toggleRisk,
        updateSelectAll,
    } = useRiskQuestionnaireSelection(risks);
    const { handleBatchSend, sending } = useRiskQuestionnaireBatchSend({
        // The refresh after a send keeps the send result on screen (D9 outcome).
        fetchRisks: () => fetchRisks(),
        filters,
        selectedIds,
        selectAll,
        setErrorKey,
        setResult,
        setSelectedIds,
    });

    useEffect(() => {
        const loadDepartments = async () => {
            try {
                const depts = await departmentApi.getDepartments();
                setDepartments(depts.map(d => ({ value: String(d.id), label: d.name })));
            } catch (e) {
                // Non-blocking
                logError('Failed to load departments', e);
            }
        };
        void loadDepartments();
    }, []);

    useEffect(() => {
        void reloadRisks();
    }, [reloadRisks]);

    const errorText = translateUiMessage(t, errorKey);
    const hasActiveFilters = Object.values(filters).some((value) => value !== undefined);

    return (
        <div className="space-y-6">
            <CardHeader
                className="mb-0"
                icon={FileText}
                title={t('riskhub.tabs.questionnaires')}
                description={t('riskhub.questionnaires.subtitle')}
                actions={<RefreshButton onRefresh={() => void reloadRisks()} isFetching={loading} />}
            />

            {/* GAP-C-11: a refetch failure over stale rows is a banner; a first-load
                failure is the table's own error state, never "no risks". */}
            {loadFailed && !loading && risks.length > 0 ? (
                <ErrorState variant="banner" onRetry={() => void reloadRisks()} />
            ) : null}

            {errorKey && !isSendConfirmOpen && (
                <InlineMessage tone="danger">{errorText}</InlineMessage>
            )}

            {result && (
                // D9: the outcome of the send stays on screen as a summary (counts, no
                // "Label: value" concatenation, GAP-B-14).
                <InlineMessage tone="success" title={t('riskhub.questionnaires.results')}>
                    <dl className="mt-1 grid grid-cols-[auto_auto] justify-start gap-x-4 gap-y-1 text-foreground">
                        <dt>{t('riskhub.questionnaires.created')}</dt>
                        <dd className="font-medium">{format.number(result.created_count)}</dd>
                        <dt>{t('riskhub.questionnaires.skipped_no_owner')}</dt>
                        <dd className="font-medium">{format.number(result.skipped_no_owner.length)}</dd>
                        <dt>{t('riskhub.questionnaires.skipped_open')}</dt>
                        <dd className="font-medium">{format.number(result.skipped_open_exists.length)}</dd>
                        {result.errors.length > 0 ? (
                            <>
                                <dt className="text-destructive">{t('riskhub.questionnaires.errors')}</dt>
                                <dd className="font-medium text-destructive">{format.number(result.errors.length)}</dd>
                            </>
                        ) : null}
                    </dl>
                </InlineMessage>
            )}

            <Card tone="nested" padding="none" className="overflow-hidden">
                <div className="grid grid-cols-1 items-end gap-3 border-b border-border p-4 md:grid-cols-5">
                    <Field label={t('riskhub.questionnaires.department')}>
                        {(field) => (
                            <ThemedSelect
                                {...field}
                                value={departmentId}
                                onValueChange={setDepartmentId}
                                placeholder={t('riskhub.questionnaires.all_departments')}
                                allowEmpty
                                emptyLabel={t('riskhub.questionnaires.all_departments')}
                                options={departments}
                            />
                        )}
                    </Field>
                    <Field label={t('riskhub.questionnaires.process')}>
                        {(field) => (
                            <Input
                                {...field}
                                value={process}
                                onChange={(e) => setProcess(e.target.value)}
                            />
                        )}
                    </Field>
                    <Field label={t('riskhub.questionnaires.category')}>
                        {(field) => (
                            <Input
                                {...field}
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                            />
                        )}
                    </Field>
                    <Field label={t('common:labels.status')}>
                        {(field) => (
                            <ThemedSelect
                                {...field}
                                value={status}
                                onValueChange={(v) => setStatus(v as RiskStatus | '')}
                                placeholder={t('riskhub.questionnaires.all_statuses')}
                                allowEmpty
                                emptyLabel={t('riskhub.questionnaires.all_statuses')}
                                options={[
                                    { value: 'active', label: t('riskhub.questionnaires.status_active') },
                                    { value: 'emerging', label: t('riskhub.questionnaires.status_emerging') },
                                ]}
                            />
                        )}
                    </Field>
                    {canBatchSend ? (
                        <Field
                            layout="inline"
                            label={t('riskhub.questionnaires.select_all')}
                            className="h-10 items-center gap-2"
                        >
                            {(field) => (
                                <Checkbox
                                    {...field}
                                    checked={selectAll}
                                    onCheckedChange={updateSelectAll}
                                />
                            )}
                        </Field>
                    ) : null}
                </div>

                <Table density="compact" regionLabel={t('riskhub.tabs.questionnaires')}>
                    <THead>
                        <TR>
                            <TH className="w-10">
                                {canBatchSend ? (
                                    <Checkbox
                                        aria-label={t('riskhub.questionnaires.select_all_visible')}
                                        checked={selectAll ? true : allVisibleSelected}
                                        onCheckedChange={toggleAllVisible}
                                        disabled={selectAll || risks.length === 0}
                                    />
                                ) : null}
                            </TH>
                            <TH>{t('common:labels.name')}</TH>
                            <TH>{t('common:labels.description')}</TH>
                            <TH>{t('common:labels.department')}</TH>
                            <TH>{t('riskhub.questionnaires.owner')}</TH>
                        </TR>
                    </THead>
                    <TBody>
                        {loading ? (
                            <TR>
                                <TD colSpan={5} className="py-6">
                                    <LoadingState layout="inline" label={t('riskhub.questionnaires.loading')} />
                                </TD>
                            </TR>
                        ) : loadFailed && risks.length === 0 ? (
                            <TR>
                                <TD colSpan={5} className="py-6">
                                    <ErrorState
                                        layout="inline"
                                        onRetry={() => void reloadRisks()}
                                        testId="risk-questionnaires-load-error"
                                    />
                                </TD>
                            </TR>
                        ) : risks.length === 0 ? (
                            <TR>
                                <TD colSpan={5}>
                                    <EmptyState
                                        kind={hasActiveFilters ? 'no-results' : 'no-data'}
                                        title={t('riskhub.questionnaires.empty')}
                                        testId="risk-questionnaires-empty"
                                    />
                                </TD>
                            </TR>
                        ) : (
                            risks.map(risk => (
                                <TR key={risk.id}>
                                    <TD>
                                        {canBatchSend ? (
                                            <Checkbox
                                                aria-label={t('riskhub.questionnaires.select_risk', { name: risk.name })}
                                                checked={selectAll ? true : selectedIds.has(risk.id)}
                                                onCheckedChange={() => toggleRisk(risk.id)}
                                                disabled={selectAll}
                                            />
                                        ) : null}
                                    </TD>
                                    <TD className="text-sm font-medium text-foreground">{risk.name}</TD>
                                    <TD className="text-sm text-muted-foreground">{risk.description}</TD>
                                    <TD className="text-sm text-muted-foreground">{risk.department_name ?? '—'}</TD>
                                    <TD className="text-sm text-muted-foreground">
                                        {risk.owner_id ? (risk.owner_name ?? t('common:fallbacks.unknown_user')) : '—'}
                                    </TD>
                                </TR>
                            ))
                        )}
                    </TBody>
                </Table>

                {canBatchSend ? (
                    <div className="flex items-center justify-between gap-3 border-t border-border p-4">
                        <p className="text-xs text-muted-foreground">
                            {selectAll
                                ? t('riskhub.questionnaires.select_all_hint')
                                : t('riskhub.questionnaires.selected_count', { count: selectedIds.size })}
                        </p>
                        <Button
                            variant="accent"
                            onClick={() => {
                                setErrorKey(null);
                                setIsSendConfirmOpen(true);
                            }}
                            disabled={!selectAll && selectedIds.size === 0}
                            isLoading={sending}
                        >
                            {sending ? null : <Send aria-hidden="true" />}
                            {t('riskhub.questionnaires.send')}
                        </Button>
                    </div>
                ) : null}
            </Card>
            <ConfirmDialog
                isOpen={isSendConfirmOpen}
                onClose={() => {
                    setIsSendConfirmOpen(false);
                    setErrorKey(null);
                }}
                onConfirm={async () => {
                    if (await handleBatchSend()) setIsSendConfirmOpen(false);
                }}
                intent="send"
                title={selectAll
                    ? t('riskhub.questionnaires.confirm_all_title')
                    : t('riskhub.questionnaires.confirm_title', { count: selectedIds.size })}
                message={selectAll
                    ? t('riskhub.questionnaires.confirm_all_body')
                    : t('riskhub.questionnaires.confirm_body')}
                confirmLabel={t('riskhub.questionnaires.send')}
                isLoading={sending}
                errorText={isSendConfirmOpen && errorText ? errorText : null}
            />
        </div>
    );
}
