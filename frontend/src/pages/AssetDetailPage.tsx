import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArchiveRestore, ArrowLeft, Pencil, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
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

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
    return (
        <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</p>
            <p className="text-sm text-white">{value === null || value === undefined || value === '' ? '—' : value}</p>
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
            <div className="glass-card animate-pulse text-sm text-slate-400">{tCommon('loading')}</div>
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
                <p className="text-xs text-slate-500">{t('detail.derived_fields_note')}</p>
            </div>

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
