import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArchiveRestore, ArrowLeft, Pencil, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CriticalityClassPill } from '@/components/ict-register/CriticalityClassPill';
import { useTranslation } from '@/i18n/hooks';
import { logError } from '@/services/logger';
import { assetApi } from '@/services/assetApi';
import type { Asset } from '@/types/asset';

import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { AssetForm } from './assets/AssetForm';
import { AssetLinkSections } from './assets/AssetLinkSections';
import { getAssetDisplayStatus } from './assets/assetsPagePresentation';
import { getAssetStatusColor } from './assets/assetColumns';
import { useAssetDetailState, type AssetDetailMode } from './assets/useAssetDetailState';

interface AssetDetailPageProps {
    mode?: AssetDetailMode;
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

function DerivedPillField({
    label,
    criticalityClass,
    testId,
}: {
    label: string;
    criticalityClass: string | null | undefined;
    testId?: string;
}) {
    return (
        <div className="space-y-1" data-testid={testId}>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
            <CriticalityClassPill criticalityClass={criticalityClass} />
        </div>
    );
}

export function AssetDetailPage({ mode = 'view' }: AssetDetailPageProps) {
    const navigate = useNavigate();
    const { t } = useTranslation('assets');
    const { t: tCommon } = useTranslation('common');
    const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const {
        asset,
        canArchive,
        canEdit,
        canRestore,
        error,
        fetchAsset,
        isAccessDenied,
        isLoading,
        restoreAsset,
    } = useAssetDetailState({ mode, notFoundMessage: t('errors.not_found') });

    const createGateState = useCreateCapabilityGate({
        enabled: mode === 'new',
        load: useCallback(() => assetApi.getAssets({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load asset create capabilities.',
    });

    const archiveAsset = async () => {
        if (!asset) {
            return;
        }
        try {
            setIsArchiving(true);
            await assetApi.archiveAsset(asset.id);
            void navigate('/assets');
        } catch (archiveError) {
            logError('Failed to archive asset:', archiveError);
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
                        onClick={() => navigate('/assets')}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-white">{t('actions.new')}</h1>
                        <p className="text-slate-500 font-medium mt-1">{t('subtitle')}</p>
                    </div>
                </div>
                <AssetForm
                    onSaved={(saved: Asset) => navigate(`/assets/${saved.id}`)}
                    onCancel={() => navigate('/assets')}
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

    if (error || !asset) {
        return (
            <div className="glass-card space-y-4">
                <div className="flex items-start gap-3 text-rose-300">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{error ?? t('errors.not_found')}</p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/assets')}
                    className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white transition-colors text-sm font-semibold"
                >
                    {t('actions.back_to_register')}
                </button>
            </div>
        );
    }

    if (mode === 'edit') {
        if (canEdit !== true) {
            return <FormCapabilityGateState state="denied" />;
        }
        return (
            <div className="space-y-8">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(`/assets/${asset.id}`)}
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-white">{t('actions.edit')}</h1>
                        <p className="text-slate-500 font-medium mt-1">{asset.name}</p>
                    </div>
                </div>
                <AssetForm
                    initialData={asset}
                    isEdit
                    onSaved={(saved: Asset) => navigate(`/assets/${saved.id}`)}
                    onCancel={() => navigate(`/assets/${asset.id}`)}
                />
            </div>
        );
    }

    const status = getAssetDisplayStatus(asset);

    return (
        <div className="space-y-8">
            {actionError ? (
                <div className="glass-card flex items-start gap-3 border border-rose-400/30 text-rose-300">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{actionError}</p>
                </div>
            ) : null}

            <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/assets')}
                        data-testid="asset-detail-back"
                        className="p-2.5 glass rounded-xl text-slate-400 hover:text-white transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getAssetStatusColor(status)}`}
                            >
                                {t(`status.${status}`)}
                            </span>
                            {asset.asset_type ? (
                                <span className="text-xs font-bold text-slate-400">{asset.asset_type}</span>
                            ) : null}
                        </div>
                        <h1 className="text-3xl font-bold text-white mt-1">{asset.name}</h1>
                        <p className="text-slate-500 font-medium mt-1">
                            {asset.asset_level ?? ''}
                            {asset.deployment_model ? `${asset.asset_level ? ' · ' : ''}${asset.deployment_model}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {canRestore && (
                        <button
                            type="button"
                            onClick={() => void restoreAsset()}
                            data-testid="asset-detail-restore"
                            className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-semibold"
                        >
                            <ArchiveRestore className="h-4 w-4" />
                            {t('actions.restore')}
                        </button>
                    )}
                    {canEdit && (
                        <button
                            type="button"
                            onClick={() => navigate(`/assets/${asset.id}/edit`)}
                            data-testid="asset-detail-edit"
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
                            data-testid="asset-detail-archive"
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
                    {t('form.sections.identity')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <DetailField label={t('form.asset_type')} value={asset.asset_type} />
                    <DetailField label={t('form.asset_level')} value={asset.asset_level} />
                    <DetailField label={t('form.deployment_model')} value={asset.deployment_model} />
                    <DetailField label={t('form.physical_location')} value={asset.physical_location} />
                    <DetailField label={t('form.alternative_names')} value={asset.alternative_names} />
                </div>
                {asset.description ? (
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.description')}</p>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{asset.description}</p>
                    </div>
                ) : null}
            </div>

            <div className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.ownership')}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <DetailField label={t('form.business_owner')} value={asset.business_owner} />
                    <DetailField label={t('form.owner_department')} value={asset.owner_department} />
                    <DetailField label={t('form.ict_owner')} value={asset.ict_owner} />
                    <DetailField label={t('form.gdpr_relevance')} value={asset.gdpr_relevance} />
                    <DetailField label={t('form.ai_relevance')} value={asset.ai_relevance} />
                    <DetailField label={t('form.data_classification')} value={asset.data_classification} />
                </div>
            </div>

            <div className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.ratings')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    <DetailField label={t('form.confidentiality_rating')} value={asset.confidentiality_rating} />
                    <DetailField label={t('form.integrity_rating')} value={asset.integrity_rating} />
                    <DetailField label={t('form.availability_rating')} value={asset.availability_rating} />
                    <DetailField label={t('form.authenticity_rating')} value={asset.authenticity_rating} />
                </div>
            </div>

            {asset.derived ? (
                <div className="glass-card space-y-5" data-testid="asset-derived-section">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                        {t('derived.title')}
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                        <DetailField label={t('derived.ciaa_value')} value={asset.derived.ciaa_value} />
                        <DetailField label={t('derived.weighted_score')} value={asset.derived.weighted_score} />
                        <DerivedPillField
                            label={t('derived.score_criticality')}
                            criticalityClass={asset.derived.score_criticality}
                        />
                        <DerivedPillField
                            label={t('derived.business_criticality')}
                            criticalityClass={asset.derived.business_criticality}
                        />
                        <DerivedPillField
                            label={t('derived.resulting_criticality')}
                            criticalityClass={asset.derived.resulting_criticality}
                            testId="asset-derived-resulting-criticality"
                        />
                        <DetailField
                            label={t('derived.article8_classification')}
                            value={asset.derived.article8_classification}
                        />
                        <DetailField
                            label={t('derived.cif')}
                            value={asset.derived.cif}
                            testId="asset-derived-cif"
                        />
                        <DetailField label={t('derived.spof')} value={asset.derived.spof} />
                        <DetailField
                            label={t('derived.external_dependency')}
                            value={asset.derived.external_dependency}
                        />
                        <DetailField label={t('derived.legacy')} value={asset.derived.legacy} />
                        <DetailField
                            label={t('derived.linked_process_count')}
                            value={asset.derived.linked_process_count}
                        />
                        <DetailField
                            label={t('derived.linked_vendor_count')}
                            value={asset.derived.linked_vendor_count}
                        />
                        <DetailField
                            label={t('derived.is_complete')}
                            value={
                                asset.derived.is_complete
                                    ? `✓ ${t('derived.complete')}`
                                    : `⚠ ${t('derived.incomplete')}`
                            }
                            testId="asset-derived-completeness"
                        />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-5 border-t border-white/5 pt-4">
                        <DetailField
                            label={t('derived.primary_process_name')}
                            value={asset.derived.primary_process_name}
                        />
                        <DerivedPillField
                            label={t('derived.primary_process_criticality')}
                            criticalityClass={asset.derived.primary_process_criticality}
                        />
                        <DetailField
                            label={t('derived.inherited_rto_hours')}
                            value={asset.derived.inherited_rto_hours}
                        />
                        <DetailField
                            label={t('derived.inherited_impact_operations')}
                            value={asset.derived.inherited_impact_operations}
                        />
                        <DetailField
                            label={t('derived.inherited_impact_financial')}
                            value={asset.derived.inherited_impact_financial}
                        />
                        <DetailField
                            label={t('derived.cif_process_count')}
                            value={asset.derived.cif_process_count}
                        />
                        <DetailField
                            label={t('derived.cif_process_names')}
                            value={
                                asset.derived.cif_process_names.length
                                    ? asset.derived.cif_process_names.join(', ')
                                    : t('derived.inputs.none')
                            }
                        />
                        <DetailField
                            label={t('derived.linked_asset_names')}
                            value={
                                asset.derived.linked_asset_names.length
                                    ? asset.derived.linked_asset_names.join(', ')
                                    : t('derived.inputs.none')
                            }
                        />
                    </div>

                    <div className="space-y-4 border-t border-white/5 pt-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
                            {t('derived.inputs.title')}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                            <DetailField
                                label={t('derived.inputs.rank_primary')}
                                value={asset.derived.inputs.rank_primary_process_criticality}
                            />
                            <DetailField
                                label={t('derived.inputs.rank_score')}
                                value={asset.derived.inputs.rank_score_criticality}
                            />
                            <DetailField
                                label={t('derived.inputs.rank_preliminary')}
                                value={asset.derived.inputs.rank_preliminary_criticality}
                            />
                            <DetailField
                                label={t('derived.inputs.rank_business')}
                                value={asset.derived.inputs.rank_business_criticality}
                            />
                            <DetailField
                                label={t('derived.inputs.rank_cif_floor')}
                                value={asset.derived.inputs.rank_cif_floor}
                            />
                            <DetailField label={t('derived.inputs.h_rank')} value={asset.derived.h_rank} />
                            <DetailField
                                label={t('derived.inputs.thresholds')}
                                value={`≤${asset.derived.inputs.threshold_low_score} / ≤${asset.derived.inputs.threshold_medium_score} / ≤${asset.derived.inputs.threshold_high_score}`}
                            />
                            <DetailField
                                label={t('derived.inputs.reference_date')}
                                value={asset.derived.inputs.reference_date}
                            />
                            <DetailField
                                label={t('derived.inputs.missing')}
                                value={
                                    asset.derived.inputs.missing_for_completeness.length
                                        ? asset.derived.inputs.missing_for_completeness.join(', ')
                                        : t('derived.inputs.none')
                                }
                                testId="asset-derived-missing"
                            />
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">{t('detail.derived_fields_note')}</p>
                </div>
            ) : null}

            <div className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.impact_dependencies')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    <DetailField label={t('form.impact_client')} value={asset.impact_client} />
                    <DetailField label={t('form.impact_regulatory')} value={asset.impact_regulatory} />
                    <DetailField label={t('form.substitutability_rating')} value={asset.substitutability_rating} />
                    <DetailField label={t('form.vendor_dependency_rating')} value={asset.vendor_dependency_rating} />
                    <DetailField label={t('form.internet_exposed')} value={asset.internet_exposed} />
                    <DetailField label={t('form.preliminary_criticality')} value={asset.preliminary_criticality} />
                </div>
            </div>

            <div className="glass-card space-y-5">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('form.sections.lifecycle')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    <DetailField label={t('form.lifecycle_state')} value={asset.lifecycle_state} />
                    <DetailField label={t('form.standard_support_end_date')} value={asset.standard_support_end_date} />
                    <DetailField label={t('form.extended_support_end_date')} value={asset.extended_support_end_date} />
                    <DetailField label={t('form.custom_support_end_date')} value={asset.custom_support_end_date} />
                    <DetailField label={t('form.last_legacy_risk_assessment_date')} value={asset.last_legacy_risk_assessment_date} />
                    <DetailField label={t('form.review_state')} value={asset.review_state} />
                </div>
                {asset.notes ? (
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.notes')}</p>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{asset.notes}</p>
                    </div>
                ) : null}
            </div>

            <AssetLinkSections
                asset={asset}
                canManageLinks={canEdit === true}
                onLinksChanged={() => fetchAsset()}
            />

            <ConfirmDialog
                isOpen={isArchiveDialogOpen}
                onClose={() => setIsArchiveDialogOpen(false)}
                onConfirm={archiveAsset}
                title={tCommon('actions.archive')}
                message={t('messages.archive_confirm', { assetName: asset.name })}
                confirmLabel={tCommon('actions.archive')}
                variant="danger"
                isLoading={isArchiving}
            />
        </div>
    );
}

export default AssetDetailPage;
