import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Pencil } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ApprovalQueuedNotice } from '@/components/approvals/ApprovalQueuedNotice';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PendingChangeCancellationDialog } from '@/components/approvals/PendingChangeCancellationDialog';
import { PendingChangePanel } from '@/components/approvals/PendingChangePanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardTitle } from '@/components/ui/card';
import { CriticalityClassPill } from '@/components/ict-register/CriticalityClassPill';
import { useAuthz } from '@/authz/useAuthz';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
import { useFeedback } from '@/hooks/useFeedback';
import { useTranslation, useFormat } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { logError } from '@/services/logger';
import { assetApi } from '@/services/assetApi';
import { approvalsApi } from '@/services/approvalsApi';
import type { Asset } from '@/types/asset';
import { isProcessApprovalQueuedResponse } from '@/types/process';
import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';

import { DetailField, DetailFieldList } from './detail/DetailField';
import { DetailLoadUnavailableState, DetailStaleWarning } from './detail/DetailLoadState';
import { DetailSection } from './detail/DetailSection';
import { EditBlockedState } from './detail/EditBlockedState';
import { OwnershipGovernanceAlert } from './detail/OwnershipGovernanceAlert';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { AssetForm } from './assets/AssetForm';
import { AssetLinkSections } from './assets/AssetLinkSections';
import {
    assetCompletenessFieldLabel,
    assetDepartmentDisplay,
    assetDerivedArticle8Label,
    assetDerivedBooleanLabel,
    assetDerivedCriticalityLabel,
    assetOwnerDisplayName,
    assetOwnerMetadata,
    getAssetDisplayStatus,
} from './assets/assetsPagePresentation';
import { getAssetStatusTone } from './assets/assetColumns';
import { useAssetDetailState, type AssetDetailMode } from './assets/useAssetDetailState';
import { appendRegisterReturnTo, resolveRegisterReturnTo } from './shared/registerReturnContext';
import { LoadingState } from '@/components/ui/state';

/**
 * PM-1 reason policy for archiving an asset: the API routes the archive of a
 * protected asset (CIF or critical) through approval, where a reason is
 * mandatory; otherwise it is optional. Unknown protection fails closed.
 */
function assetArchiveReasonPolicy(asset: Asset): 'required' | 'optional' {
    if (!asset.derived) return 'required';
    return asset.derived.cif === 'yes' || asset.derived.resulting_criticality === 'critical'
        ? 'required'
        : 'optional';
}

interface AssetDetailPageProps {
    mode?: AssetDetailMode;
}

export function AssetDetailPage({ mode = 'view' }: AssetDetailPageProps) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = resolveRegisterReturnTo(searchParams.get('return_to'), '/assets');
    const assetDetailPath = (assetId: number) => appendRegisterReturnTo(`/assets/${assetId}`, returnTo);
    const { t } = useTranslation('assets');
    const { t: tCommon } = useTranslation('common');
    const format = useFormat();
    // D14 / AX-06: every back control names its destination.
    const backToRegister = { label: t('actions.back_to_register'), onClick: () => void navigate(returnTo) };
    const authz = useAuthz();
    const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isCancellingPendingChange, setIsCancellingPendingChange] = useState(false);
    const [pendingCancellation, setPendingCancellation] = useState<{
        approvalId: number;
        targetName: string;
    } | null>(null);
    const [pendingCancellationError, setPendingCancellationError] = useState<string | null>(null);

    const {
        asset,
        canArchive,
        canEdit,
        canRestore,
        fetchAsset,
        isRetrying,
        loadOutcome,
        assetId,
        restoreAsset,
        setAsset,
    } = useAssetDetailState({ mode });

    const createGateState = useCreateCapabilityGate({
        enabled: mode === 'new',
        load: useCallback(() => assetApi.getAssets({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load asset create capabilities.',
    });

    const feedback = useFeedback();
    const announceApprovalQueued = useApprovalQueued();

    const archiveAsset = async (requestReason?: string) => {
        if (!asset) {
            return;
        }
        try {
            setIsArchiving(true);
            setActionError(null);
            const result = await assetApi.archiveAsset(asset.id, requestReason?.trim() ?? '');
            setIsArchiveDialogOpen(false);
            if (isProcessApprovalQueuedResponse(result)) {
                // D12 / PM-2: stay on the asset with the pending notice + toast.
                announceApprovalQueued({ approvalId: result.approval_id });
                void fetchAsset();
                return;
            }
            feedback.success({ title: tCommon('outcome.archived', { name: asset.name }) });
            void navigate(returnTo);
        } catch (archiveError) {
            logError('Failed to archive asset:', archiveError);
            setActionError(t('errors.archive_failed'));
        } finally {
            setIsArchiving(false);
        }
    };

    const openPendingChangeCancellation = () => {
        if (!asset?.pending_change?.approval_id) return;
        setPendingCancellationError(null);
        setPendingCancellation({
            approvalId: asset.pending_change.approval_id,
            targetName: asset.name,
        });
    };

    const cancelPendingChange = async () => {
        if (!pendingCancellation || isCancellingPendingChange) return;
        try {
            setIsCancellingPendingChange(true);
            setPendingCancellationError(null);
            await approvalsApi.cancel(pendingCancellation.approvalId);
            setPendingCancellation(null);
            void fetchAsset();
        } catch (cancelError) {
            logError('Failed to cancel pending Asset change:', cancelError);
            setPendingCancellationError(t('pending_change.cancel_failed'));
        } finally {
            setIsCancellingPendingChange(false);
        }
    };

    if (mode === 'new') {
        // D7 / D14: the page title, back control and breadcrumbs stay in place
        // while the create capability loads or is denied.
        const newHeader = (
            <PageHeader
                title={t('actions.new')}
                description={t('subtitle')}
                back={backToRegister}
                breadcrumbs={[{ label: t('title'), to: returnTo }, { label: t('actions.new') }]}
            />
        );
        if (createGateState.state !== 'allowed') {
            return (
                <PageContainer size="form">
                    {newHeader}
                    <FormCapabilityGateState state={createGateState.state} onRetry={createGateState.retry} />
                </PageContainer>
            );
        }
        return (
            <PageContainer size="form">
                {newHeader}
                <AssetForm
                    onSaved={(saved: Asset) => {
                        feedback.success({ title: tCommon('success.created'), description: saved.name });
                        void navigate(assetDetailPath(saved.id));
                    }}
                    onApprovalQueued={(queued) => announceApprovalQueued({ approvalId: queued.approval_id, to: returnTo })}
                    onCancel={() => navigate(returnTo)}
                />
            </PageContainer>
        );
    }

    if (loadOutcome === 'loading') {
        return (
            <LoadingState layout="page" label={tCommon('loading.generic')} />
        );
    }

    if (loadOutcome === 'unavailable' || !asset) {
        return (
            <DetailLoadUnavailableState
                backLabel={t('actions.back_to_register')}
                isRetrying={isRetrying}
                onBack={() => navigate(returnTo)}
                onRetry={assetId === null ? undefined : () => void fetchAsset()}
            />
        );
    }

    const staleWarning = loadOutcome === 'stale-with-error' ? (
        <DetailStaleWarning isRetrying={isRetrying} onRetry={() => void fetchAsset()} />
    ) : null;
    const pendingCancellationDialog = (
        <PendingChangeCancellationDialog
            isOpen={pendingCancellation !== null}
            targetName={pendingCancellation?.targetName ?? ''}
            isLoading={isCancellingPendingChange}
            errorText={pendingCancellationError}
            onClose={() => {
                setPendingCancellation(null);
                setPendingCancellationError(null);
            }}
            onConfirm={() => void cancelPendingChange()}
        />
    );

    const pendingChangePanel = asset.pending_change ? (
        <PendingChangePanel
            pendingChange={asset.pending_change}
            namespace="assets"
            testIdPrefix="asset"
            cancelling={isCancellingPendingChange}
            onCancel={openPendingChangeCancellation}
        />
    ) : null;
    // SM-05: the ownership banner; the governance action is offered only to
    // users who can open the Governance queue.
    const ownershipAlert = (testId?: string) => (
        <OwnershipGovernanceAlert
            message={t('detail.ownership_pending')}
            actionLabel={t('detail.resolve_in_governance')}
            onAction={authz.canViewGovernance ? () => navigate('/governance?type=asset') : undefined}
            testId={testId}
            actionTestId="asset-orphan-governance"
        />
    );

    const editBack = {
        label: tCommon('actions.back_to_detail', { name: asset.name }),
        onClick: () => void navigate(assetDetailPath(asset.id)),
    };
    const editBreadcrumbs = [
        { label: t('title'), to: returnTo },
        { label: asset.name, to: assetDetailPath(asset.id) },
        { label: t('actions.edit') },
    ];
    const editHeader = (
        <PageHeader
            title={t('actions.edit')}
            description={asset.name}
            documentTitle={tCommon('page_title.edit', { name: asset.name })}
            back={editBack}
            breadcrumbs={editBreadcrumbs}
        />
    );

    if (mode === 'edit') {
        if (resolveCapabilityFlag(asset.capabilities, 'business_edit_blocked')) {
            return (
                <>
                    <EditBlockedState
                        notice={staleWarning}
                        entityName={asset.name}
                        documentTitle={tCommon('page_title.edit', { name: asset.name })}
                        back={editBack}
                        breadcrumbs={editBreadcrumbs}
                        testId="asset-edit-blocked"
                    >
                        {pendingChangePanel}
                    </EditBlockedState>
                    {pendingCancellationDialog}
                </>
            );
        }
        if (asset.ownership_status === 'pending_governance') {
            return (
                <PageContainer>
                    {staleWarning}
                    {editHeader}
                    {ownershipAlert('asset-orphan-edit-blocked')}
                </PageContainer>
            );
        }
        if (canEdit !== true) {
            return (
                <PageContainer size="form">
                    {editHeader}
                    <FormCapabilityGateState state="denied" />
                </PageContainer>
            );
        }
        return (
            <PageContainer size="form">
                {staleWarning}
                {editHeader}
                <AssetForm
                    initialData={asset}
                    isEdit
                    onSaved={(saved: Asset) => {
                        setAsset(saved);
                        feedback.success({ title: tCommon('success.updated'), description: saved.name });
                        void navigate(assetDetailPath(saved.id));
                    }}
                    onApprovalQueued={(queued) => announceApprovalQueued({
                        approvalId: queued.approval_id,
                        to: assetDetailPath(asset.id),
                    })}
                    onCancel={() => navigate(assetDetailPath(asset.id))}
                />
            </PageContainer>
        );
    }

    const status = getAssetDisplayStatus(asset);

    return (
        <PageContainer>
            {staleWarning}
            <ApprovalQueuedNotice />
            {pendingChangePanel}
            {asset.ownership_status === 'pending_governance' ? ownershipAlert() : null}

            <EntityDetailHeader
                back={{ ...backToRegister, testId: 'asset-detail-back' }}
                breadcrumbs={[{ label: t('title'), to: returnTo }, { label: asset.name }]}
                identifierSeparatorLabel={tCommon('detail_header.identifier_separator')}
                title={asset.name}
                statuses={(
                    <>
                        <Badge tone={getAssetStatusTone(status)}>{t(`status.${status}`)}</Badge>
                        {asset.asset_type ? (
                            <span className="text-xs font-bold text-muted-foreground">{t(`values.asset_type.${asset.asset_type}`)}</span>
                        ) : null}
                    </>
                )}
                metadata={(
                    <span>
                        {asset.asset_level ? t(`values.asset_level.${asset.asset_level}`) : ''}
                        {asset.deployment_model ? `${asset.asset_level ? ' · ' : ''}${t(`values.deployment_model.${asset.deployment_model}`)}` : ''}
                    </span>
                )}
                description={asset.description}
                actions={(
                    <>
                        {canRestore && (
                            <Button
                                variant="outline"
                                onClick={() => void restoreAsset()}
                                data-testid="asset-detail-restore"
                            >
                                <ArchiveRestore aria-hidden="true" />
                                {t('actions.restore')}
                            </Button>
                        )}
                        {canEdit && !resolveCapabilityFlag(asset.capabilities, 'business_edit_blocked') && asset.ownership_status !== 'pending_governance' && (
                            <Button
                                variant="outline"
                                onClick={() => navigate(appendRegisterReturnTo(`/assets/${asset.id}/edit`, returnTo))}
                                data-testid="asset-detail-edit"
                            >
                                <Pencil aria-hidden="true" />
                                {t('actions.edit')}
                            </Button>
                        )}
                        {canArchive && !resolveCapabilityFlag(asset.capabilities, 'business_edit_blocked') && (
                            <Button
                                variant="destructive"
                                onClick={() => {
                                    setActionError(null);
                                    setIsArchiveDialogOpen(true);
                                }}
                                data-testid="asset-detail-archive"
                            >
                                <Archive aria-hidden="true" />
                                {tCommon('actions.archive')}
                            </Button>
                        )}
                    </>
                )}
            />

            <DetailSection title={t('form.sections.identity')}>
                <DetailFieldList className="md:grid-cols-3">
                    <DetailField label={t('form.asset_type')} value={asset.asset_type ? t(`values.asset_type.${asset.asset_type}`) : null} />
                    <DetailField label={t('form.asset_level')} value={asset.asset_level ? t(`values.asset_level.${asset.asset_level}`) : null} />
                    <DetailField label={t('form.deployment_model')} value={asset.deployment_model ? t(`values.deployment_model.${asset.deployment_model}`) : null} />
                    <DetailField label={t('form.physical_location')} value={asset.physical_location} />
                    <DetailField label={t('form.alternative_names')} value={asset.alternative_names} />
                </DetailFieldList>
            </DetailSection>

            <DetailSection title={t('form.sections.ownership')}>
                <DetailFieldList className="md:grid-cols-3">
                    <DetailField label={t('form.business_owner')} value={assetOwnerDisplayName(asset.business_owner) ?? t('detail.unknown_owner')} />
                    <DetailField label={t('form.business_owner_department')} value={assetOwnerMetadata(asset.business_owner)} />
                    <DetailField label={t('form.ict_owner')} value={assetOwnerDisplayName(asset.ict_owner) ?? t('detail.unknown_owner')} />
                    <DetailField label={t('form.ict_owner_department')} value={assetOwnerMetadata(asset.ict_owner)} />
                    <DetailField label={t('form.owner_department')} value={assetDepartmentDisplay(asset) ?? t('detail.unknown_department')} />
                    <DetailField label={t('form.gdpr_relevance')} value={asset.gdpr_relevance ? t(`values.gdpr_relevance.${asset.gdpr_relevance}`) : null} />
                    <DetailField label={t('form.ai_relevance')} value={asset.ai_relevance ? t(`values.ai_relevance.${asset.ai_relevance}`) : null} />
                    <DetailField label={t('form.data_classification')} value={asset.data_classification ? t(`values.data_classification.${asset.data_classification}`) : null} />
                </DetailFieldList>
            </DetailSection>

            <DetailSection title={t('form.sections.ratings')}>
                <DetailFieldList className="grid-cols-2 md:grid-cols-4">
                    <DetailField label={t('form.confidentiality_rating')} value={asset.confidentiality_rating} />
                    <DetailField label={t('form.integrity_rating')} value={asset.integrity_rating} />
                    <DetailField label={t('form.availability_rating')} value={asset.availability_rating} />
                    <DetailField label={t('form.authenticity_rating')} value={asset.authenticity_rating} />
                </DetailFieldList>
            </DetailSection>

            {asset.derived ? (
                <DetailSection title={t('derived.title')} testId="asset-derived-section">
                    <div className="space-y-5">
                        <DetailFieldList className="grid-cols-2 md:grid-cols-4">
                            <DetailField label={t('derived.ciaa_value')} value={asset.derived.ciaa_value} />
                            <DetailField label={t('derived.weighted_score')} value={asset.derived.weighted_score} />
                            <DetailField
                                label={t('derived.score_criticality')}
                                value={(
                                    <CriticalityClassPill
                                        criticalityClass={asset.derived.score_criticality}
                                        displayValue={assetDerivedCriticalityLabel(t, asset.derived.score_criticality)}
                                    />
                                )}
                            />
                            <DetailField
                                label={t('derived.business_criticality')}
                                value={(
                                    <CriticalityClassPill
                                        criticalityClass={asset.derived.business_criticality}
                                        displayValue={assetDerivedCriticalityLabel(t, asset.derived.business_criticality)}
                                    />
                                )}
                            />
                            <DetailField
                                label={t('derived.resulting_criticality')}
                                value={(
                                    <CriticalityClassPill
                                        criticalityClass={asset.derived.resulting_criticality}
                                        displayValue={assetDerivedCriticalityLabel(t, asset.derived.resulting_criticality)}
                                    />
                                )}
                                testId="asset-derived-resulting-criticality"
                            />
                            <DetailField
                                label={t('derived.article8_classification')}
                                value={assetDerivedArticle8Label(t, asset.derived.article8_classification)}
                            />
                            <DetailField
                                label={t('derived.cif')}
                                value={assetDerivedBooleanLabel(t, asset.derived.cif)}
                                testId="asset-derived-cif"
                            />
                            <DetailField
                                label={t('derived.spof')}
                                value={assetDerivedBooleanLabel(t, asset.derived.spof)}
                            />
                            <DetailField
                                label={t('derived.external_dependency')}
                                value={assetDerivedBooleanLabel(t, asset.derived.external_dependency)}
                            />
                            <DetailField
                                label={t('derived.legacy')}
                                value={assetDerivedBooleanLabel(t, asset.derived.legacy)}
                            />
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
                        </DetailFieldList>

                        <DetailFieldList className="grid-cols-2 border-t border-border pt-4 md:grid-cols-3">
                            <DetailField
                                label={t('derived.primary_process_name')}
                                value={asset.derived.primary_process_name}
                            />
                            <DetailField
                                label={t('derived.primary_process_criticality')}
                                value={(
                                    <CriticalityClassPill
                                        criticalityClass={asset.derived.primary_process_criticality}
                                        displayValue={assetDerivedCriticalityLabel(t, asset.derived.primary_process_criticality)}
                                    />
                                )}
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
                        </DetailFieldList>

                        <div className="space-y-4 border-t border-border pt-4">
                            <CardTitle as="h3">{t('derived.inputs.title')}</CardTitle>
                            <DetailFieldList className="grid-cols-2 md:grid-cols-3">
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
                                    value={format.date(asset.derived.inputs.reference_date)}
                                />
                                <DetailField
                                    label={t('derived.inputs.missing')}
                                    value={
                                        asset.derived.inputs.missing_for_completeness.length
                                            ? asset.derived.inputs.missing_for_completeness
                                                .map((field) => assetCompletenessFieldLabel(t, field))
                                                .join(', ')
                                            : t('derived.inputs.none')
                                    }
                                    testId="asset-derived-missing"
                                />
                            </DetailFieldList>
                        </div>
                        <p className="text-xs text-muted-foreground">{t('detail.derived_fields_note')}</p>
                    </div>
                </DetailSection>
            ) : null}

            <DetailSection title={t('form.sections.impact_dependencies')}>
                <DetailFieldList className="grid-cols-2 md:grid-cols-3">
                    <DetailField label={t('form.impact_client')} value={asset.impact_client} />
                    <DetailField label={t('form.impact_regulatory')} value={asset.impact_regulatory} />
                    <DetailField label={t('form.substitutability_rating')} value={asset.substitutability_rating} />
                    <DetailField label={t('form.vendor_dependency_rating')} value={asset.vendor_dependency_rating} />
                    <DetailField label={t('form.internet_exposed')} value={asset.internet_exposed ? t(`values.internet_exposed.${asset.internet_exposed}`) : null} />
                    <DetailField label={t('form.preliminary_criticality')} value={asset.preliminary_criticality ? t(`values.preliminary_criticality.${asset.preliminary_criticality}`) : null} />
                </DetailFieldList>
            </DetailSection>

            <DetailSection title={t('form.sections.lifecycle')}>
                <DetailFieldList className="grid-cols-2 md:grid-cols-3">
                    <DetailField label={t('form.lifecycle_state')} value={asset.lifecycle_state ? t(`values.lifecycle_state.${asset.lifecycle_state}`) : null} />
                    <DetailField label={t('form.standard_support_end_date')} value={format.date(asset.standard_support_end_date)} />
                    <DetailField label={t('form.extended_support_end_date')} value={format.date(asset.extended_support_end_date)} />
                    <DetailField label={t('form.custom_support_end_date')} value={format.date(asset.custom_support_end_date)} />
                    <DetailField label={t('form.last_legacy_risk_assessment_date')} value={format.date(asset.last_legacy_risk_assessment_date)} />
                    <DetailField label={t('form.review_state')} value={asset.review_state ? t(`values.review_state.${asset.review_state}`) : null} />
                </DetailFieldList>
                {asset.notes ? (
                    <DetailFieldList className="mt-5 md:grid-cols-1">
                        <DetailField label={t('form.notes')} value={asset.notes} />
                    </DetailFieldList>
                ) : null}
            </DetailSection>

            <AssetLinkSections
                asset={asset}
                canManageLinks={canEdit === true && !resolveCapabilityFlag(asset.capabilities, 'business_edit_blocked')}
                onLinksChanged={() => fetchAsset()}
            />

            {/* D10 / PM-1: archive errors stay in the dialog; the reason is
                required when the archive can be routed through approval
                (a protected asset, or unknown protection). */}
            <ConfirmDialog
                isOpen={isArchiveDialogOpen}
                onClose={() => {
                    setIsArchiveDialogOpen(false);
                    setActionError(null);
                }}
                onConfirm={archiveAsset}
                intent="archive"
                entityLabel={tCommon('labels.asset')}
                message={t('messages.archive_confirm', { assetName: asset.name })}
                isLoading={isArchiving}
                reason={assetArchiveReasonPolicy(asset)}
                reasonLabel={t('form.request_reason')}
                reasonPlaceholder={t('form.request_reason_help')}
                errorText={actionError}
            />
            {pendingCancellationDialog}
        </PageContainer>
    );
}

export default AssetDetailPage;
