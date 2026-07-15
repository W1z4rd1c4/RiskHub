import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArchiveRestore, ArrowLeft, Pencil, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuthz } from '@/authz/useAuthz';
import { useTranslation } from '@/i18n/hooks';
import { logError } from '@/services/logger';
import { threatApi } from '@/services/threatApi';
import type { Threat } from '@/types/threat';

import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { ThreatForm } from './threats/ThreatForm';
import { ThreatRiskLinksSection } from './threats/ThreatRiskLinksSection';
import { getThreatDisplayStatus, threatCategoryLabel } from './threats/threatsPagePresentation';
import { getThreatStatusColor } from './threats/threatColumns';
import { useThreatDetailState, type ThreatDetailMode } from './threats/useThreatDetailState';

interface ThreatDetailPageProps {
    mode?: ThreatDetailMode;
}

function DetailField({
    label,
    value,
    testId,
}: {
    label: string;
    value: string | null | undefined;
    testId?: string;
}) {
    return (
        <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
            <p className="text-sm text-white whitespace-pre-wrap" data-testid={testId}>
                {value === null || value === undefined || value === '' ? '—' : value}
            </p>
        </div>
    );
}

function StewardshipAlert({
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
                    data-testid="threat-orphan-governance"
                    className="shrink-0 rounded-xl border border-amber-300/30 px-4 py-2 text-sm font-bold text-amber-100 transition-colors hover:bg-amber-300/10"
                >
                    {actionLabel}
                </button>
            ) : null}
        </div>
    );
}

export function ThreatDetailPage({ mode = 'view' }: ThreatDetailPageProps) {
    const navigate = useNavigate();
    const authz = useAuthz();
    const { t } = useTranslation('threats');
    const { t: tCommon } = useTranslation('common');
    const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const {
        canArchive,
        canEdit,
        canRestore,
        error,
        fetchThreat,
        isAccessDenied,
        isLoading,
        setThreat,
        threat,
        restoreThreat,
    } = useThreatDetailState({ mode, notFoundMessage: t('errors.not_found') });

    const createGateState = useCreateCapabilityGate({
        enabled: mode === 'new',
        load: useCallback(() => threatApi.getThreats({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load threat create capabilities.',
    });

    const archiveThreat = async () => {
        if (!threat) {
            return;
        }
        try {
            setIsArchiving(true);
            await threatApi.archiveThreat(threat.id);
            void navigate('/threats');
        } catch (archiveError) {
            logError('Failed to archive threat:', archiveError);
            setActionError(t('errors.archive_failed'));
        } finally {
            setIsArchiving(false);
            setIsArchiveDialogOpen(false);
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
                        onClick={() => navigate('/threats')}
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
                <ThreatForm
                    onSaved={(saved: Threat) => navigate(`/threats/${saved.id}`)}
                    onCancel={() => navigate('/threats')}
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

    if (error || !threat) {
        return (
            <div className="glass-card space-y-4">
                <div className="flex items-start gap-3 text-rose-300">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{error ?? t('errors.not_found')}</p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/threats')}
                    className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white transition-colors text-sm font-semibold"
                >
                    {t('actions.back_to_register')}
                </button>
            </div>
        );
    }

    if (mode === 'edit') {
        if (threat.stewardship_status === 'pending_governance') {
            return (
                <div className="space-y-8">
                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            onClick={() => navigate(`/threats/${threat.id}`)}
                            aria-label={t('actions.back_to_register')}
                            className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors shrink-0"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-bold text-white">{t('actions.edit')}</h1>
                            <p className="text-slate-500 font-medium mt-1">{threat.name}</p>
                        </div>
                    </div>
                    <StewardshipAlert
                        actionLabel={t('actions.resolve_in_governance')}
                        message={t(authz.canViewGovernance
                            ? 'messages.steward_orphaned_governance'
                            : 'messages.steward_orphaned_request')}
                        onResolve={authz.canViewGovernance
                            ? () => navigate('/governance?type=threat')
                            : undefined}
                        testId="threat-orphan-edit-blocked"
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
                        onClick={() => navigate(`/threats/${threat.id}`)}
                        aria-label={t('actions.back_to_register')}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-white">{t('actions.edit')}</h1>
                        <p className="text-slate-500 font-medium mt-1">{threat.name}</p>
                    </div>
                </div>
                {threat.stewardship_status === 'legacy_unassigned' ? (
                    <StewardshipAlert message={t('messages.stewardship_legacy_unassigned')} />
                ) : null}
                {threat.stewardship_status === 'invalid_assignment' ? (
                    <StewardshipAlert message={t('messages.stewardship_invalid_assignment')} />
                ) : null}
                <ThreatForm
                    initialData={threat.stewardship_status === 'invalid_assignment'
                        ? { ...threat, threat_steward_user_id: null }
                        : threat}
                    isEdit
                    onSaved={(saved: Threat) => {
                        // The edit and view routes share the same detail-query
                        // key. Replace its cached pre-edit snapshot before
                        // navigating so the saved controlled values render
                        // immediately instead of waiting for stale-time expiry.
                        setThreat(saved);
                        void navigate(`/threats/${saved.id}`);
                    }}
                    onCancel={() => navigate(`/threats/${threat.id}`)}
                />
            </div>
        );
    }

    const status = getThreatDisplayStatus(threat);

    return (
        <div className="space-y-8">
            {actionError ? (
                <div className="glass-card flex items-start gap-3 border border-rose-400/30 text-rose-300">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{actionError}</p>
                </div>
            ) : null}
            {threat.stewardship_status === 'pending_governance' ? (
                <StewardshipAlert
                    actionLabel={t('actions.resolve_in_governance')}
                    message={t(authz.canViewGovernance
                        ? 'messages.steward_orphaned_governance'
                        : 'messages.steward_orphaned_request')}
                    onResolve={authz.canViewGovernance
                        ? () => navigate('/governance?type=threat')
                        : undefined}
                />
            ) : null}
            {threat.stewardship_status === 'legacy_unassigned' ? (
                <StewardshipAlert message={t('messages.stewardship_legacy_unassigned')} />
            ) : null}
            {threat.stewardship_status === 'invalid_assignment' ? (
                <StewardshipAlert message={t('messages.stewardship_invalid_assignment')} />
            ) : null}

            <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/threats')}
                        data-testid="threat-detail-back"
                        aria-label={t('actions.back_to_register')}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            {threat.category ? (
                                <span className="text-xs font-bold text-accent">{threatCategoryLabel(t, threat.category)}</span>
                            ) : null}
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getThreatStatusColor(status)}`}
                            >
                                {t(`status.${status}`)}
                            </span>
                        </div>
                        <h1 className="text-3xl font-bold text-white mt-1">{threat.name}</h1>
                        {threat.relevant_subject ? (
                            <p className="text-slate-500 font-medium mt-1">{threat.relevant_subject}</p>
                        ) : null}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {canRestore && (
                        <button
                            type="button"
                            onClick={() => void restoreThreat()}
                            data-testid="threat-detail-restore"
                            className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-semibold"
                        >
                            <ArchiveRestore className="h-4 w-4" />
                            {t('actions.restore')}
                        </button>
                    )}
                    {canEdit && threat.stewardship_status !== 'pending_governance' && (
                        <button
                            type="button"
                            onClick={() => navigate(`/threats/${threat.id}/edit`)}
                            data-testid="threat-detail-edit"
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
                            data-testid="threat-detail-archive"
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
                    {t('form.sections.details')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <DetailField label={t('form.category')} value={threatCategoryLabel(t, threat.category)} testId="threat-detail-category" />
                    <DetailField
                        label={t('form.steward')}
                        value={threat.threat_steward
                            ? `${threat.threat_steward.name} — ${threat.threat_steward.email}`
                            : undefined}
                        testId="threat-detail-steward"
                    />
                    <DetailField label={t('form.relevant_subject')} value={threat.relevant_subject} />
                    <DetailField label={t('form.description')} value={threat.description} />
                    <DetailField label={t('form.typical_weaknesses')} value={threat.typical_weaknesses} />
                </div>
                {threat.notes ? (
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.notes')}</p>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{threat.notes}</p>
                    </div>
                ) : null}
            </div>

            <ThreatRiskLinksSection
                threat={threat}
                canManageLinks={canEdit === true}
                onLinksChanged={() => fetchThreat()}
            />

            <ConfirmDialog
                isOpen={isArchiveDialogOpen}
                onClose={() => setIsArchiveDialogOpen(false)}
                onConfirm={archiveThreat}
                title={tCommon('actions.archive')}
                message={t('messages.archive_confirm', { threatName: threat.name })}
                confirmLabel={tCommon('actions.archive')}
                variant="danger"
                isLoading={isArchiving}
            />
        </div>
    );
}

export default ThreatDetailPage;
