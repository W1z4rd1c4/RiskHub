import { Building2 } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

interface KriVendorContextBannerProps {
    vendorName?: string;
}

export function KriVendorContextBanner({
    vendorName,
}: KriVendorContextBannerProps) {
    const { t } = useTranslation('kris');

    return (
        <div
            className="mb-6 rounded-2xl border border-accent/20 bg-accent/10 p-4"
            data-testid="kri-vendor-context-banner"
        >
            <div className="flex items-start gap-3">
                <div className="rounded-xl border border-accent/20 bg-accent/10 p-2.5">
                    <Building2 className="h-4 w-4 text-accent" />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-accent">
                        {t('vendor_assignment.vendor_context_label')}
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                        {vendorName || t('vendor_assignment.vendor_context_active')}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                        {t('vendor_assignment.vendor_context_help')}
                    </p>
                </div>
            </div>
        </div>
    );
}
