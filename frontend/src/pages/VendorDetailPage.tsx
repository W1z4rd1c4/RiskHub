import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { ArrowLeft, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { VendorDetailHeader } from './vendors/VendorDetailHeader';
import { VendorFormView } from './vendors/VendorFormView';
import { VendorSummaryCards } from './vendors/VendorSummaryCards';
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
        activeTab,
        canEdit,
        canEditByOwnership,
        canRestore,
        closeIssueModal,
        error,
        isIssueModalOpen,
        isLoading,
        openIssueModal,
        restoreVendor,
        selectTab,
        vendor,
    } = useVendorDetailState({
        mode,
        currentUserId: user?.id,
        canWriteVendor: hasPermission('vendors', 'write'),
        canDeleteVendor: hasPermission('vendors', 'delete'),
        notFoundMessage: t('errors.not_found'),
    });

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
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">{t('labels.loading')}</p>
            </div>
        );
    }

    if (error || !vendor) {
        return (
            <div className="glass-card flex flex-col items-center justify-center p-20 text-center gap-4">
                <div className="bg-rose-500/20 p-4 rounded-full">
                    <XCircle className="h-10 w-10 text-rose-500" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">{t('errors.vendor_not_found')}</h3>
                    <p className="text-slate-500 mt-2 font-medium">{error || t('errors.not_found')}</p>
                </div>
                <button
                    onClick={() => navigate('/vendors')}
                    className="mt-4 px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-all flex items-center gap-2"
                >
                    <ArrowLeft className="h-4 w-4" /> {t('title')}
                </button>
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
        <div className="space-y-8">
            <VendorDetailHeader
                vendor={vendor}
                canEdit={canEdit}
                canRestore={canRestore}
                onBack={() => navigate('/vendors')}
                onOpenIssueModal={openIssueModal}
                onEdit={() => navigate(`/vendors/${vendor.id}/edit`)}
                onRestore={() => void restoreVendor()}
            />

            <VendorSummaryCards vendor={vendor} />

            <VendorTabs activeTab={activeTab} onSelectTab={selectTab} />

            <VendorTabPanel
                vendor={vendor}
                activeTab={activeTab}
                canEdit={canEdit}
                canEditContractControls={canEditByOwnership || hasPermission('vendor_contracts', 'write')}
            />

            <IssueQuickCreateModal
                isOpen={isIssueModalOpen}
                onClose={closeIssueModal}
                contextEntityType="vendor"
                contextEntityId={vendor.id}
                contextEntityLabel={vendor.name}
                onCreated={(issue) => navigate(`/issues/${issue.id}`)}
            />
        </div>
    );
}
