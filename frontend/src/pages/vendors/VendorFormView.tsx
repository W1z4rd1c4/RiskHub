import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';

import { VendorForm } from '@/components/VendorForm';
import { VendorActionButton, VendorSurface } from '@/components/vendors/vendorRouteUi';
import type { Vendor } from '@/types/vendor';

import type { VendorDetailMode } from './vendorDetailPresentation';

interface VendorFormViewProps {
    mode: Extract<VendorDetailMode, 'new' | 'edit'>;
    onBack: () => void;
    onCancel: () => void;
    onSaved: (vendor: Vendor) => void;
    vendor?: Vendor;
}

export function VendorFormView({
    mode,
    onBack,
    onCancel,
    onSaved,
    vendor,
}: VendorFormViewProps) {
    const { t } = useTranslation('vendors');

    return (
        <div className="vendor-route">
            <div className="vendor-page space-y-8">
                <VendorSurface tone="emphasis" className="space-y-4">
                    <div className="flex items-start gap-3">
                        <VendorActionButton variant="ghost" onClick={onBack} className="shrink-0">
                            <ArrowLeft className="h-4 w-4" />
                        </VendorActionButton>
                        <div className="min-w-0">
                            <h1 className="vendor-title text-3xl font-black tracking-tight">
                            {mode === 'new' ? t('actions.new') : t('actions.edit')}
                            </h1>
                            <p className="mt-2 text-sm vendor-muted">
                                {mode === 'new' ? t('subtitle') : vendor?.name}
                            </p>
                        </div>
                    </div>
                </VendorSurface>

                <VendorForm
                    initialData={mode === 'edit' ? vendor : undefined}
                    isEdit={mode === 'edit'}
                    onSaved={onSaved}
                    onCancel={onCancel}
                />
            </div>
        </div>
    );
}
