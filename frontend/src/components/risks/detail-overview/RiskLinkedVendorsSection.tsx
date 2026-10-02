import { motion } from 'framer-motion';
import { Handshake } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardHeader } from '@/components/ui/card';
import { useTranslation } from '@/i18n/hooks';
import { ordinalSeverityBand, severityClass } from '@/lib/severity';
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
            <CardHeader icon={Handshake} title={t('overview.linked_vendors', { ns: 'risks' })} className="mb-6 border-b border-border pb-4" />

            {linkedVendors.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-border rounded-2xl">
                    <p className="text-xs text-muted-foreground font-medium">{t('overview.no_vendors_linked', { ns: 'risks' })}</p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {linkedVendors.map((vendor) => (
                        <Button
                            key={vendor.id}
                            variant="ghost"
                            onClick={() => onNavigateToVendor(vendor.id)}
                            className="h-auto w-full flex-col items-stretch justify-start gap-3 whitespace-normal rounded-xl border border-border bg-nested p-4 text-left font-normal hover:border-accent/30"
                        >
                            <span className="flex items-start justify-between gap-3">
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-bold text-foreground">{vendor.name}</span>
                                    <span className="block truncate text-xs text-muted-foreground">{vendor.department_name || t('overview.unassigned', { ns: 'risks' })}</span>
                                </span>
                                <Badge
                                    size="sm"
                                    className={severityClass('badge', ordinalSeverityBand(vendor.risk_score_1_5))}
                                    title={t('overview.vendor_risk_score', { ns: 'risks', score: vendor.risk_score_1_5 })}
                                >
                                    {t('overview.score_of_five', { ns: 'risks', score: vendor.risk_score_1_5 })}
                                </Badge>
                            </span>
                            {vendor.dora_relevant || vendor.supports_important_core_insurance_function ? (
                                <span className="flex flex-wrap gap-2">
                                    {vendor.dora_relevant && (
                                        <Badge size="sm" tone="info">
                                            DORA
                                        </Badge>
                                    )}
                                    {vendor.supports_important_core_insurance_function && (
                                        <Badge size="sm" tone="success">
                                            {t('overview.core_function_badge', { ns: 'risks' })}
                                        </Badge>
                                    )}
                                </span>
                            ) : null}
                        </Button>
                    ))}
                </div>
            )}
        </motion.div>
    );
}
