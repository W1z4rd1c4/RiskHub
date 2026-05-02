import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { AlertCircle, ArrowUpRight, TriangleAlert, XCircle } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { VendorInlineMessage } from '@/components/vendors/vendorRouteUi';
import { vendorApi } from '@/services/vendorApi';
import { FormCapabilityGateState } from './shared/FormCapabilityGateState';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { useCreateCapabilityGate } from './shared/useCreateCapabilityGate';
import { VendorOverviewTab } from './vendors/VendorOverviewTab';
import { VendorDetailHeader } from './vendors/VendorDetailHeader';
import { VendorFormView } from './vendors/VendorFormView';
import { useVendorDetailState } from './vendors/useVendorDetailState';
import { logError } from '@/services/logger';
import {
    buildVendorDetailPath,
    type VendorDetailMode,
} from './vendors/vendorDetailPresentation';
import { VendorDetailErrorState, VendorDetailLoadingState } from './vendors/VendorDetailStates';
import { useVendorDeepLinkScroll, useVendorFlashMessage } from './vendors/useVendorDetailPageEffects';

interface VendorDetailPageProps {
    mode?: VendorDetailMode;
}

export function VendorDetailPage({ mode = 'view' }: VendorDetailPageProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation('vendors');

    const {
        canArchive,
        canCreateIssue,
        canCreateLinkedControl,
        canCreateLinkedKri,
        canCreateLinkedRisk,
        canEdit,
        canLinkControl,
        canLinkKri,
        canLinkRisk,
        canRestore,
        closeIssueModal,
        error,
        isAccessDenied,
        isIssueModalOpen,
        isLoading,
        openIssueModal,
        restoreVendor,
        vendor,
    } = useVendorDetailState({
        mode,
        notFoundMessage: t('errors.not_found'),
    });
    const { t: tCommon } = useTranslation('common');
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const { actionMessage, dismissActionMessage, setActionMessage } = useVendorFlashMessage(location, navigate);
    useVendorDeepLinkScroll(location);
    const createGateState = useCreateCapabilityGate({
        enabled: mode === 'new',
        load: useCallback(() => vendorApi.getVendors({ offset: 0, limit: 1 }), []),
        logMessage: 'Failed to load vendor create capabilities.',
    });

    const archiveVendor = async () => {
        if (!vendor) {
            return;
        }
        try {
            setIsDeleting(true);
            await vendorApi.deleteVendor(vendor.id);
            void navigate('/vendors');
        } catch (error) {
            logError('Failed to archive vendor:', error);
            setActionMessage({
                tone: 'danger',
                message: t('errors.load_failed'),
            });
        } finally {
            setIsDeleting(false);
            setIsDeleteDialogOpen(false);
        }
    };

    if (mode === 'new') {
        if (createGateState !== 'allowed') {
            return <FormCapabilityGateState state={createGateState} />;
        }

        return (
            <VendorFormView
                mode="new"
                onBack={() => navigate('/vendors')}
                onSaved={(saved) => navigate(`/vendors/${saved.id}`)}
                onCancel={() => navigate('/vendors')}
            />
        );
    }

    if (isLoading) {
        return <VendorDetailLoadingState />;
    }

    if (isAccessDenied) {
        return <ReadAccessDeniedState />;
    }

    if (error || !vendor) {
        return <VendorDetailErrorState error={error} onBack={() => navigate('/vendors')} />;
    }

    if (mode === 'edit') {
        if (canEdit !== true) {
            return <FormCapabilityGateState state="denied" />;
        }

        return (
            <VendorFormView
                mode="edit"
                vendor={vendor}
                onBack={() => navigate(`/vendors/${vendor.id}`)}
                onSaved={(saved) => navigate(`/vendors/${saved.id}`)}
                onCancel={() => navigate(`/vendors/${vendor.id}`)}
            />
        );
    }

    return (
        <div className="vendor-route">
            <div className="vendor-page space-y-8">
                {actionMessage && (
                <VendorInlineMessage tone={actionMessage.tone}>
                    {actionMessage.tone === 'warn' ? (
                        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                    ) : (
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    )}
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
                        <div className="space-y-2">
                            <p className="text-sm font-medium">{actionMessage.message}</p>
                            {actionMessage.ctaHref && actionMessage.ctaLabel ? (
                                <Link
                                    to={actionMessage.ctaHref}
                                    className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest hover:opacity-80 transition-opacity"
                                >
                                    {actionMessage.ctaLabel}
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                </Link>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            onClick={dismissActionMessage}
                            className="opacity-60 transition-opacity hover:opacity-100"
                        >
                            <XCircle className="h-4 w-4" />
                        </button>
                    </div>
                </VendorInlineMessage>
                )}

                <VendorDetailHeader
                    vendor={vendor}
                    canArchive={canArchive}
                    canEdit={canEdit}
                    canCreateIssue={canCreateIssue}
                    canRestore={canRestore}
                    onArchive={() => setIsDeleteDialogOpen(true)}
                    onBack={() => navigate('/vendors')}
                    onOpenIssueModal={openIssueModal}
                    onEdit={() => navigate(`/vendors/${vendor.id}/edit`)}
                    onRestore={() => void restoreVendor()}
                />

                <VendorOverviewTab
                    vendor={vendor}
                    canLinkControl={canLinkControl}
                    canLinkKri={canLinkKri}
                    canLinkRisk={canLinkRisk}
                    canCreateControl={canCreateLinkedControl}
                    canCreateKri={canCreateLinkedKri}
                    canCreateRisk={canCreateLinkedRisk}
                    onAddControl={() => navigate(`/controls/new?vendor_id=${vendor.id}&return_to=${encodeURIComponent(buildVendorDetailPath(vendor.id))}`)}
                    onAddKri={() => navigate(`/kris/new?vendor_id=${vendor.id}&return_to=${encodeURIComponent(buildVendorDetailPath(vendor.id))}`)}
                    onAddRisk={() => navigate(`/risks/new?vendor_id=${vendor.id}&return_to=${encodeURIComponent(buildVendorDetailPath(vendor.id))}`)}
                    onNavigateToControl={(controlId) => navigate(`/controls/${controlId}`)}
                    onNavigateToKri={(kriId) => navigate(`/kris/${kriId}`)}
                    onNavigateToRisk={(riskId) => navigate(`/risks/${riskId}`)}
                />

                <IssueQuickCreateModal
                    isOpen={isIssueModalOpen}
                    onClose={closeIssueModal}
                    contextEntityType="vendor"
                    contextEntityId={vendor.id}
                    contextEntityLabel={vendor.name}
                    onCreated={(issue) => navigate(`/issues/${issue.id}`)}
                />

                <ConfirmDialog
                    isOpen={isDeleteDialogOpen}
                    onClose={() => setIsDeleteDialogOpen(false)}
                    onConfirm={archiveVendor}
                    title={tCommon('actions.archive')}
                    message={t('messages.archive_confirm', { vendorName: vendor.name })}
                    confirmLabel={tCommon('actions.archive')}
                    variant="danger"
                    isLoading={isDeleting}
                />
            </div>
        </div>
    );
}

export default VendorDetailPage;
