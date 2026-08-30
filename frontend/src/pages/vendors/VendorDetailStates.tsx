import { useTranslation } from '@/i18n/hooks';

import { VendorSurface } from '@/components/vendors/vendorRouteUi';

export function VendorDetailLoadingState() {
    const { t } = useTranslation('vendors');

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
