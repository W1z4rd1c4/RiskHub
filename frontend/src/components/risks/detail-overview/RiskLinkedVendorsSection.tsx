import { motion } from 'framer-motion';
import { Handshake } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { Vendor } from '@/types/vendor';

interface RiskLinkedVendorsSectionProps {
    linkedVendors: Vendor[];
    onNavigateToVendor: (vendorId: number) => void;
}

export function RiskLinkedVendorsSection({
    linkedVendors,
    onNavigateToVendor,
}: RiskLinkedVendorsSectionProps) {
    const { t } = useTranslation(['risks']);

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55 }}
            className="glass-card"
        >
            <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
                <div className="flex items-center gap-3">
                    <Handshake className="h-5 w-5 text-chart-2" />
                    <h3 className="font-bold text-foreground uppercase tracking-widest text-xs">{t('overview.linked_vendors', { ns: 'risks' })}</h3>
                </div>
            </div>

            {linkedVendors.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-border rounded-2xl">
                    <p className="text-xs text-muted-foreground font-medium">{t('overview.no_vendors_linked', { ns: 'risks' })}</p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {linkedVendors.map((vendor) => (
                        <button
                            key={vendor.id}
                            onClick={() => onNavigateToVendor(vendor.id)}
                            className="group text-left bg-tint/5 border border-border rounded-2xl p-4 hover:bg-tint/10 hover:border-accent/30 transition-all"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-foreground truncate">{vendor.name}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{vendor.department_name || t('overview.unassigned', { ns: 'risks' })}</p>
                                </div>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black border text-warning-text bg-warning/10 border-warning/20 whitespace-nowrap">
                                    {vendor.risk_score_1_5}/5
                                </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {vendor.dora_relevant && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black border text-accent-text bg-info/10 border-info/20">
                                        DORA
                                    </span>
                                )}
                                {vendor.supports_important_core_insurance_function && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black border text-success-text bg-success/10 border-success/20">
                                        {t('overview.core_function_badge', { ns: 'risks' })}
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </motion.div>
    );
}
