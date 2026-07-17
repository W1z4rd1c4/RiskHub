import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArchiveRestore, ArrowLeft, Pencil, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CriticalityClassPill } from '@/components/ict-register/CriticalityClassPill';
import { useAuthz } from '@/authz/useAuthz';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { approvalsApi } from '@/services/approvalsApi';
import { logError } from '@/services/logger';
import { processApi } from '@/services/processApi';
import type { Process } from '@/types/process';

import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { ProcessForm } from './processes/ProcessForm';
import { ProcessPendingChangePanel } from './processes/ProcessPendingChangePanel';
import { ProcessVendorLinksSection } from './processes/ProcessVendorLinksSection';
import {
    getProcessDisplayStatus,
    processDepartmentDisplayLabel,
    processControlledValueLabel,
    processDerivedCheckLabel,
    processDerivedCifLabel,
    processDerivedCriticalityLabel,
    processOwnerContextDisplayLabel,
    processOwnerDisplayLabel,
} from './processes/processesPagePresentation';
import { getProcessStatusColor } from './processes/processColumns';
import { useProcessDetailState, type ProcessDetailMode } from './processes/useProcessDetailState';

interface ProcessDetailPageProps {
    mode?: ProcessDetailMode;
}

function DetailField({
    label,
    value,
    testId,
}: {
    label: string;
    value: string | number | null | undefined;
    testId?: string;
}) {
    return (
        <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
            <p className="text-sm text-white" data-testid={testId}>
                {value === null || value === undefined || value === '' ? '—' : value}
            </p>
        </div>
    );
}

function DerivedCheckField({
    code,
    label,
    value,
}: {
    code: string | null | undefined;
    label: string;
    value: string | null | undefined;
}) {
    // Blank check (workbook: OR(rto="",mtpd="") guard) renders a neutral dash.
    if (value === null || value === undefined) {
        return (
            <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
                <p className="text-sm text-slate-500">—</p>
            </div>
        );
    }
    const isOk = code === 'ok';
    return (
        <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
            <p className={`text-sm font-semibold ${isOk ? 'text-emerald-400' : 'text-rose-300'}`}>{value}</p>
        </div>
    );
}

function ProcessOwnershipAlert({
    actionLabel,
    message,
    onResolve,
    testId,
}: {
    actionLabel?: string;
    message: string;
    onResolve?: () => void;
    testId?: string;
}) {
    return (
        <div
            role="alert"
            data-testid={testId}
            className="glass-card flex flex-col items-start gap-4 border border-amber-400/30 text-amber-200 sm:flex-row sm:justify-between"
        >
            <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p className="text-sm font-medium">{message}</p>
            </div>
            {onResolve ? (
                <button
                    type="button"
                    onClick={onResolve}
                    data-testid="process-orphan-governance"
                    className="shrink-0 rounded-xl border border-amber-300/30 px-4 py-2 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-300/10"
                >
                    {actionLabel}
                </button>
            ) : null}
        </div>
    );
}

export function ProcessDetailPage({ mode = 'view' }: ProcessDetailPageProps) {
    const navigate = useNavigate();
    const authz = useAuthz();
    const { t, i18n } = useTranslation('processes');
    const { t: tCommon } = useTranslation('common');
    const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [isCancellingPendingChange, setIsCancellingPendingChange] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const {
        canArchive,
        canEdit,
        canRestore,
        error,
        fetchProcess,
        isAccessDenied,
        isLoading,
        process,
        restoreProcess,
        setProcess,
    } = useProcessDetailState({ mode, notFoundMessage: t('errors.not_found') });

    const createGateState = useCreateCapabilityGate({
        enabled: mode === 'new',
        load: useCallback(() => processApi.getProcesses({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load process create capabilities.',
    });

    const archiveProcess = async () => {
        if (!process) {
            return;
        }
        try {
            setIsArchiving(true);
            await processApi.archiveProcess(process.id);
            void navigate('/processes');
        } catch (archiveError) {
            logError('Failed to archive process:', archiveError);
            setActionError(t('errors.archive_failed'));
        } finally {
            setIsArchiving(false);
            setIsArchiveDialogOpen(false);
        }
    };

    const cancelPendingChange = async () => {
        if (!process?.pending_change) return;
        try {
            setIsCancellingPendingChange(true);
            setActionError(null);
            await approvalsApi.cancel(process.pending_change.approval_id);
            await fetchProcess();
        } catch (cancelError) {
            logError('Failed to cancel pending Process change:', cancelError);
            setActionError(t('pending_change.cancel_failed'));
        } finally {
            setIsCancellingPendingChange(false);
        }
    };

    if (mode === 'new') {
        if (createGateState !== 'allowed') {
            return <FormCapabilityGateState state={createGateState} />;
        }
        return (
            <div className="space-y-8">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/processes')}
                        aria-label={t('actions.back_to_register')}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-white">{t('actions.new')}</h1>
                        <p className="text-slate-500 font-medium mt-1">{t('subtitle')}</p>
                    </div>
                </div>
                <ProcessForm
                    onSaved={(saved: Process) => navigate(`/processes/${saved.id}`)}
                    onCancel={() => navigate('/processes')}
                />
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="glass-card animate-pulse text-sm text-slate-400">{tCommon('loading.generic')}</div>
        );
    }

    if (isAccessDenied) {
        return <ReadAccessDeniedState />;
    }

    if (error || !process) {
        return (
            <div className="glass-card space-y-4">
                <div className="flex items-start gap-3 text-rose-300">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{error ?? t('errors.not_found')}</p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/processes')}
                    className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white transition-colors text-sm font-semibold"
                >
                    {t('actions.back_to_register')}
                </button>
            </div>
        );
    }

    if (mode === 'edit') {
        if (process.capabilities?.business_edit_blocked || process.pending_change) {
            return (
                <div className="space-y-8">
                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            onClick={() => navigate(`/processes/${process.id}`)}
                            aria-label={t('actions.back_to_register')}
                            className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors shrink-0"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-bold text-white">{t('pending_change.edit_blocked_title')}</h1>
                            <p className="text-slate-500 font-medium mt-1">{process.l1_process}</p>
                        </div>
                    </div>
                    {actionError ? (
                        <div role="alert" className="glass-card border border-rose-400/30 text-sm text-rose-300">
                            {actionError}
                        </div>
                    ) : null}
                    {process.pending_change ? (
                        <ProcessPendingChangePanel
                            pendingChange={process.pending_change}
                            locale={i18n.language}
                            cancelling={isCancellingPendingChange}
                            onCancel={resolveCapabilityFlag(process.pending_change.capabilities, 'can_cancel')
                                ? () => void cancelPendingChange()
                                : undefined}
                        />
                    ) : (
                        <div role="status" className="glass-card border border-amber-400/30 text-sm text-amber-200">
                            {t('pending_change.business_edits_blocked')}
                        </div>
                    )}
                </div>
            );
        }
        if (process.ownership_status === 'pending_governance') {
            return (
                <div className="space-y-8">
                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            onClick={() => navigate(`/processes/${process.id}`)}
                            aria-label={t('actions.back_to_register')}
                            className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors shrink-0"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-bold text-white">{t('actions.edit')}</h1>
                            <p className="text-slate-500 font-medium mt-1">{process.l1_process}</p>
                        </div>
                    </div>
                    <ProcessOwnershipAlert
                        actionLabel={t('actions.resolve_in_governance')}
                        message={t(authz.canViewGovernance
                            ? 'messages.owner_orphaned_governance'
                            : 'messages.owner_orphaned_request')}
                        onResolve={authz.canViewGovernance
                            ? () => navigate('/governance?type=process')
                            : undefined}
                        testId="process-orphan-edit-blocked"
                    />
                </div>
            );
        }
        if (canEdit !== true) {
            return <FormCapabilityGateState state="denied" />;
        }
        return (
            <div className="space-y-8">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(`/processes/${process.id}`)}
                        aria-label={t('actions.back_to_register')}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-white">{t('actions.edit')}</h1>
                        <p className="text-slate-500 font-medium mt-1">{process.l1_process}</p>
                    </div>
                </div>
                {process.ownership_status === 'legacy_unassigned' ? (
                    <ProcessOwnershipAlert message={t('messages.ownership_legacy_unassigned')} />
                ) : null}
                {process.ownership_status === 'invalid_assignment' ? (
                    <ProcessOwnershipAlert message={t('messages.ownership_invalid_assignment')} />
                ) : null}
                <ProcessForm
                    initialData={process.ownership_status === 'invalid_assignment'
                        ? {
                            ...process,
                            process_owner_user_id: null,
                            owning_department_id: null,
                        }
                        : process}
                    isEdit
                    onApprovalQueued={() => {
                        void navigate(`/processes/${process.id}`);
                    }}
                    onSaved={(saved: Process) => {
                        setProcess(saved);
                        void navigate(`/processes/${saved.id}`);
                    }}
                    onCancel={() => navigate(`/processes/${process.id}`)}
                />
            </div>
        );
    }

    const status = getProcessDisplayStatus(process);

    return (
        <div className="space-y-8">
            {actionError ? (
                <div className="glass-card flex items-start gap-3 border border-rose-400/30 text-rose-300">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{actionError}</p>
                </div>
            ) : null}
            {process.pending_change ? (
                <ProcessPendingChangePanel
                    pendingChange={process.pending_change}
                    locale={i18n.language}
                    cancelling={isCancellingPendingChange}
                    onCancel={resolveCapabilityFlag(process.pending_change.capabilities, 'can_cancel')
                        ? () => void cancelPendingChange()
                        : undefined}
                />
            ) : null}
            {process.ownership_status === 'pending_governance' ? (
                <ProcessOwnershipAlert
                    actionLabel={t('actions.resolve_in_governance')}
                    message={t(authz.canViewGovernance
                        ? 'messages.owner_orphaned_governance'
                        : 'messages.owner_orphaned_request')}
                    onResolve={authz.canViewGovernance
                        ? () => navigate('/governance?type=process')
                        : undefined}
                />
            ) : null}
            {process.ownership_status === 'legacy_unassigned' ? (
                <ProcessOwnershipAlert message={t('messages.ownership_legacy_unassigned')} />
            ) : null}
            {process.ownership_status === 'invalid_assignment' ? (
                <ProcessOwnershipAlert message={t('messages.ownership_invalid_assignment')} />
            ) : null}

            <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/processes')}
                        data-testid="process-detail-back"
                        aria-label={t('actions.back_to_register')}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-mono font-bold text-accent">{process.f_code}</span>
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getProcessStatusColor(status)}`}
                            >
                                {t(`status.${status}`)}
                            </span>
                        </div>
                        <h1 className="text-3xl font-bold text-white mt-1">{process.l1_process}</h1>
                        <p className="text-slate-500 font-medium mt-1">
                            {process.l0_area}
                            {process.l2_subprocess ? ` · ${process.l2_subprocess}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {canRestore && (
                        <button
                            type="button"
                            onClick={() => void restoreProcess()}
                            data-testid="process-detail-restore"
                            className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-semibold"
                        >
                            <ArchiveRestore className="h-4 w-4" />
                            {t('actions.restore')}
                        </button>
                    )}
                    {canEdit
                        && !process.capabilities?.business_edit_blocked
                        && !process.pending_change
                        && process.ownership_status !== 'pending_governance' && (
                        <button
                            type="button"
                            onClick={() => navigate(`/processes/${process.id}/edit`)}
                            data-testid="process-detail-edit"
                            className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-semibold"
                        >
                            <Pencil className="h-4 w-4" />
                            {t('actions.edit')}
                        </button>
                    )}
                    {canArchive && (
                        <button
                            type="button"
                            onClick={() => setIsArchiveDialogOpen(true)}
                            data-testid="process-detail-archive"
                            className="px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-400/30 text-rose-300 hover:bg-rose-500/20 transition-colors flex items-center gap-2 text-sm font-semibold"
                        >
                            <Trash2 className="h-4 w-4" />
                            {tCommon('actions.archive')}
                        </button>
                    )}
                </div>
            </div>

            <div className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.ownership')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <DetailField
                        label={t('form.owner')}
                        value={processOwnerDisplayLabel(t, process)}
                    />
                    <DetailField
                        label={t('form.owner_context')}
                        value={processOwnerContextDisplayLabel(t, process)}
                    />
                    <DetailField
                        label={t('form.owner_department')}
                        value={processDepartmentDisplayLabel(t, process)}
                    />
                    <DetailField
                        label={t('form.licensed_activity')}
                        value={processControlledValueLabel(t, 'licensed_activity', process.licensed_activity)}
                    />
                </div>
            </div>

            <div className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.impacts')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    <DetailField label={t('form.impact_client')} value={process.impact_client} />
                    <DetailField label={t('form.impact_market_operations')} value={process.impact_market_operations} />
                    <DetailField label={t('form.impact_regulatory')} value={process.impact_regulatory} />
                    <DetailField label={t('form.impact_financial')} value={process.impact_financial} />
                    <DetailField label={t('form.impact_reputational')} value={process.impact_reputational} />
                    <DetailField label={t('form.mtpd_hours')} value={process.mtpd_hours} />
                </div>
            </div>

            <div className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.criticality')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    <DetailField
                        label={t('form.preliminary_criticality')}
                        value={processControlledValueLabel(t, 'preliminary_criticality', process.preliminary_criticality)}
                    />
                    <DetailField
                        label={t('form.cif_override')}
                        value={processControlledValueLabel(t, 'cif_override', process.cif_override)}
                    />
                </div>
            </div>

            {process.derived ? (
                <div className="glass-card space-y-5" data-testid="process-derived-section">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                        {t('derived.title')}
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                        <DetailField
                            label={t('derived.criticality_score')}
                            value={process.derived.criticality_score}
                            testId="process-derived-score"
                        />
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                {t('derived.criticality_class')}
                            </p>
                            <CriticalityClassPill
                                criticalityClass={process.derived.criticality_class}
                                displayValue={processDerivedCriticalityLabel(t, process.derived.criticality_class)}
                            />
                        </div>
                        <DetailField
                            label={t('derived.cif')}
                            value={processDerivedCifLabel(t, process.derived.cif)}
                            testId="process-derived-cif"
                        />
                        <DetailField
                            label={t('derived.completeness')}
                            value={
                                process.derived.is_complete
                                    ? `✓ ${t('derived.complete')}`
                                    : `⚠ ${t('derived.incomplete')}`
                            }
                        />
                        <DerivedCheckField
                            code={process.derived.rto_mtpd_check}
                            label={t('derived.rto_mtpd_check')}
                            value={processDerivedCheckLabel(t, process.derived.rto_mtpd_check)}
                        />
                        <DerivedCheckField
                            code={process.derived.bcm_check}
                            label={t('derived.bcm_check')}
                            value={processDerivedCheckLabel(t, process.derived.bcm_check)}
                        />
                        <DetailField label={t('derived.next_review_date')} value={process.derived.next_review_date} />
                        <DetailField label={t('derived.linked_asset_count')} value={process.derived.linked_asset_count} />
                        <DetailField
                            label={t('derived.linked_vendor_count')}
                            value={process.derived.linked_vendor_count}
                            testId="process-derived-vendor-count"
                        />
                    </div>

                    <div
                        className="space-y-3 border-t border-white/5 pt-4"
                        data-testid="process-derived-transitive"
                    >
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
                            {t('derived.transitive.title')}
                        </h3>
                        {process.derived.transitive_vendor_links.length === 0 ? (
                            <p className="text-sm text-slate-500">{t('derived.transitive.empty')}</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            <th className="py-2 pr-4">{t('derived.transitive.vendor')}</th>
                                            <th className="py-2">{t('derived.transitive.via_asset')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {process.derived.transitive_vendor_links.map((link, index) => (
                                            <tr
                                                key={`${link.vendor_id}-${link.via_asset_id}-${index}`}
                                                className="border-t border-white/5 text-sm"
                                                data-testid={`process-derived-transitive-row-${index}`}
                                            >
                                                <td className="py-2 pr-4 font-medium text-white">
                                                    {link.vendor_name}
                                                </td>
                                                <td className="py-2 text-slate-300">{link.via_asset_name}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4 border-t border-white/5 pt-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
                            {t('derived.inputs.title')}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                            <DetailField
                                label={t('derived.inputs.impacts')}
                                value={[
                                    process.derived.inputs.impact_client,
                                    process.derived.inputs.impact_market_operations,
                                    process.derived.inputs.impact_regulatory,
                                    process.derived.inputs.impact_financial,
                                ]
                                    .map((axis) => axis ?? '—')
                                    .join(' / ')}
                            />
                            <DetailField
                                label={t('derived.inputs.mtpd_bonus')}
                                value={
                                    process.derived.inputs.mtpd_bonus != null
                                        ? `+${process.derived.inputs.mtpd_bonus}`
                                        : null
                                }
                            />
                            <DetailField
                                label={t('derived.inputs.thresholds')}
                                value={`≥${process.derived.inputs.threshold_critical_score} / ≥${process.derived.inputs.threshold_high_score} / ≥${process.derived.inputs.threshold_medium_score}`}
                            />
                            <DetailField
                                label={t('derived.inputs.class_source')}
                                value={t(
                                    process.derived.inputs.criticality_class_source === 'score'
                                        ? 'derived.inputs.class_source_score'
                                        : 'derived.inputs.class_source_preliminary'
                                )}
                            />
                            <DetailField
                                label={t('derived.inputs.cif_override')}
                                value={processControlledValueLabel(
                                    t,
                                    'cif_override',
                                    process.derived.inputs.cif_override,
                                )}
                            />
                            <DetailField
                                label={t('derived.inputs.missing')}
                                value={
                                    process.derived.inputs.missing_for_completeness.length
                                        ? process.derived.inputs.missing_for_completeness
                                              .map((field) => t(`form.${field}`))
                                              .join(', ')
                                        : t('derived.inputs.none')
                                }
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(
                                [
                                    ['cif_class_critical', process.derived.inputs.cif_class_critical],
                                    ['cif_mtpd_within_critical', process.derived.inputs.cif_mtpd_within_critical],
                                    ['cif_any_impact_maximal', process.derived.inputs.cif_any_impact_maximal],
                                ] as const
                            )
                                .filter(([, active]) => active)
                                .map(([key]) => (
                                    <span
                                        key={key}
                                        className="inline-flex items-center rounded-full border border-rose-400/20 bg-rose-400/10 px-2.5 py-0.5 text-xs font-bold text-rose-300"
                                    >
                                        {t(`derived.inputs.${key}`)}
                                    </span>
                                ))}
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">{t('detail.derived_fields_note')}</p>
                </div>
            ) : null}

            <div className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.continuity')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    <DetailField label={t('form.rto_hours')} value={process.rto_hours} />
                    <DetailField label={t('form.rpo_hours')} value={process.rpo_hours} />
                    <DetailField
                        label={t('form.bcm_link')}
                        value={processControlledValueLabel(t, 'bcm_link', process.bcm_link)}
                    />
                    <DetailField label={t('form.last_dr_test_date')} value={process.last_dr_test_date} />
                    <DetailField
                        label={t('form.dr_test_result')}
                        value={processControlledValueLabel(t, 'dr_test_result', process.dr_test_result)}
                    />
                </div>
            </div>

            <div className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.assessment')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    <DetailField
                        label={t('form.interruption_impact')}
                        value={processControlledValueLabel(t, 'interruption_impact', process.interruption_impact)}
                    />
                    <DetailField label={t('form.assessment_date')} value={process.assessment_date} />
                </div>
                {process.notes ? (
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.notes')}</p>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{process.notes}</p>
                    </div>
                ) : null}
            </div>

            <ProcessVendorLinksSection
                process={process}
                canManageLinks={canEdit === true && !process.capabilities?.business_edit_blocked && !process.pending_change}
                onLinksChanged={() => fetchProcess()}
            />

            <ConfirmDialog
                isOpen={isArchiveDialogOpen}
                onClose={() => setIsArchiveDialogOpen(false)}
                onConfirm={archiveProcess}
                title={tCommon('actions.archive')}
                message={t('messages.archive_confirm', { processName: process.l1_process })}
                confirmLabel={tCommon('actions.archive')}
                variant="danger"
                isLoading={isArchiving}
            />
        </div>
    );
}

export default ProcessDetailPage;
