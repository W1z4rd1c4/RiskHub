import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';

import { VendorForm } from '@/components/VendorForm';
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
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4 text-slate-300" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-white">
                            {mode === 'new' ? t('actions.new') : t('actions.edit')}
                        </h1>
                        <p className="text-slate-500 font-medium">
                            {mode === 'new' ? t('subtitle') : vendor?.name}
                        </p>
                    </div>
                </div>
            </div>

            <VendorForm
                initialData={mode === 'edit' ? vendor : undefined}
                isEdit={mode === 'edit'}
                onSaved={onSaved}
                onCancel={onCancel}
            />
        </div>
    );
}
