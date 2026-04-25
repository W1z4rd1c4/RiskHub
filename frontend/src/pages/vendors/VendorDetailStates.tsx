import { ArrowLeft, XCircle } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

import { VendorSurface } from '@/components/vendors/vendorRouteUi';

interface VendorDetailErrorStateProps {
    error: string | null;
    onBack: () => void;
}

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

export function VendorDetailErrorState({ error, onBack }: VendorDetailErrorStateProps) {
    const { t } = useTranslation('vendors');

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
                    <button onClick={onBack} className="vendor-button">
                        <ArrowLeft className="h-4 w-4" /> {t('title')}
                    </button>
                </VendorSurface>
            </div>
        </div>
    );
}
