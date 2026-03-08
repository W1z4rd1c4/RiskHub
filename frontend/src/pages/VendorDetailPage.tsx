import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { AlertCircle, ArrowLeft, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { VendorInlineMessage, VendorSurface } from '@/components/vendors/vendorRouteUi';
import { vendorApi } from '@/services/vendorApi';
import { VendorDetailHeader } from './vendors/VendorDetailHeader';
import { VendorFormView } from './vendors/VendorFormView';
import { VendorTabPanel } from './vendors/VendorTabPanel';
import { VendorTabs } from './vendors/VendorTabs';
import { useVendorDetailState } from './vendors/useVendorDetailState';
import type { VendorDetailMode } from './vendors/vendorDetailPresentation';

interface VendorDetailPageProps {
    mode?: VendorDetailMode;
}

export function VendorDetailPage({ mode = 'view' }: VendorDetailPageProps) {
    const navigate = useNavigate();
    const { t } = useTranslation('vendors');
    const { user, hasPermission } = useAuth();

    const {
        activeSection,
        activeTab,
        canArchive,
        canEdit,
        canEditByOwnership,
        canRestore,
        closeIssueModal,
        error,
        isIssueModalOpen,
        isLoading,
        openIssueModal,
        restoreVendor,
        selectSection,
        selectTab,
        vendor,
    } = useVendorDetailState({
        mode,
        currentUserId: user?.id,
        canWriteVendor: hasPermission('vendors', 'write'),
        canDeleteVendor: hasPermission('vendors', 'delete'),
        notFoundMessage: t('errors.not_found'),
    });
    const { t: tCommon } = useTranslation('common');
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [actionMessage, setActionMessage] = useState<string | null>(null);

    const archiveVendor = async () => {
        if (!vendor) {
            return;
        }
        try {
            setIsDeleting(true);
            await vendorApi.deleteVendor(vendor.id);
            navigate('/vendors');
        } catch (error) {
            console.error('Failed to archive vendor:', error);
            setActionMessage(t('errors.load_failed'));
        } finally {
            setIsDeleting(false);
            setIsDeleteDialogOpen(false);
        }
    };

    if (mode === 'new') {
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
        return (
            <div className="vendor-route">
                <div className="vendor-page flex h-[60vh] items-center justify-center">
                    <VendorSurface tone="emphasis" className="flex min-w-[280px] flex-col items-center gap-4 text-center">
                        <div className="h-12 w-12 rounded-full border-4 border-accent border-t-transparent animate-spin" />
                        <p className="text-sm font-semibold vendor-muted">{t('labels.loading')}</p>
                    </VendorSurface>
                </div>
            </div>
        );
    }

    if (error || !vendor) {
        return (
            <div className="vendor-route">
                <div className="vendor-page">
                    <VendorSurface className="flex flex-col items-center justify-center gap-4 p-16 text-center" tone="emphasis">
                        <div className="vendor-badge vendor-badge--danger px-4 py-3">
                            <XCircle className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="vendor-title text-2xl font-black">{t('errors.vendor_not_found')}</h3>
                            <p className="mt-2 text-sm vendor-muted">{error || t('errors.not_found')}</p>
                        </div>
                        <button
                            onClick={() => navigate('/vendors')}
                            className="vendor-button"
                        >
                            <ArrowLeft className="h-4 w-4" /> {t('title')}
                        </button>
                    </VendorSurface>
                </div>
            </div>
        );
    }

    if (mode === 'edit') {
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
                <VendorInlineMessage tone="danger">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm font-medium">{actionMessage}</p>
                    <button
                        type="button"
                        onClick={() => setActionMessage(null)}
                        className="ml-auto opacity-60 transition-opacity hover:opacity-100"
                    >
                        <XCircle className="h-4 w-4" />
                    </button>
                </VendorInlineMessage>
                )}

                <VendorDetailHeader
                    vendor={vendor}
                    canArchive={canArchive}
                    canEdit={canEdit}
                    canRestore={canRestore}
                    onArchive={() => setIsDeleteDialogOpen(true)}
                    onBack={() => navigate('/vendors')}
                    onOpenIssueModal={openIssueModal}
                    onEdit={() => navigate(`/vendors/${vendor.id}/edit`)}
                    onRestore={() => void restoreVendor()}
                />

                <VendorTabs activeTab={activeTab} onSelectTab={selectTab} />

                <VendorTabPanel
                    vendor={vendor}
                    activeSection={activeSection}
                    activeTab={activeTab}
                    canEdit={canEdit}
                    canEditContractControls={canEditByOwnership || hasPermission('vendor_contracts', 'write')}
                    onSelectSection={selectSection}
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
