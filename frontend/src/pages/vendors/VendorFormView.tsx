import { useTranslation } from '@/i18n/hooks';

import { VendorForm } from '@/components/VendorForm';
import type { BreadcrumbItem } from '@/components/layout/Breadcrumbs';
import { PageHeader, type PageBackTarget } from '@/components/layout/PageHeader';
import type { Vendor } from '@/types/vendor';
import type { ProcessApprovalQueuedResponse } from '@/types/process';

import type { VendorDetailMode } from './vendorDetailPresentation';

interface VendorFormViewProps {
    mode: Extract<VendorDetailMode, 'new' | 'edit'>;
    /** Labelled back control (D14): the register for New, the record for Edit. */
    back: PageBackTarget;
    breadcrumbs: readonly BreadcrumbItem[];
    onCancel: () => void;
    onSaved: (vendor: Vendor) => void;
    onApprovalQueued?: (queued: ProcessApprovalQueuedResponse) => void;
    vendor?: Vendor;
}

export function VendorFormView({
    mode,
    back,
    breadcrumbs,
    onCancel,
    onSaved,
    onApprovalQueued,
    vendor,
}: VendorFormViewProps) {
    const { t } = useTranslation('vendors');
    const { t: tCommon } = useTranslation('common');

    return (
        <div className="vendor-route">
            <div className="vendor-page space-y-8">
                <PageHeader
                    title={mode === 'new' ? t('actions.new') : t('actions.edit')}
                    description={mode === 'new' ? t('subtitle') : vendor?.name}
                    documentTitle={mode === 'edit' && vendor ? tCommon('page_title.edit', { name: vendor.name }) : undefined}
                    back={back}
                    breadcrumbs={breadcrumbs}
                />

                <VendorForm
                    initialData={mode === 'edit' ? vendor : undefined}
                    isEdit={mode === 'edit'}
                    onSaved={onSaved}
                    onApprovalQueued={onApprovalQueued}
                    onCancel={onCancel}
                />
            </div>
        </div>
    );
}
