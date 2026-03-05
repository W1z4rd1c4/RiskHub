import { Building2, ShieldAlert, User } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';

import type { Vendor } from '@/types/vendor';

function badge(text: string, className: string) {
    return (
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${className}`}>
            {text}
        </span>
    );
}

interface VendorSummaryCardsProps {
    vendor: Vendor;
}

export function VendorSummaryCards({ vendor }: VendorSummaryCardsProps) {
    const { t } = useTranslation('vendors');

    return (
        <>
            <div className="grid gap-6 lg:grid-cols-3">
                <section className="glass-card p-6 space-y-4 lg:col-span-2">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">
                        {t('detail.overview')}
                    </h3>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                {t('form.legal_name')}
                            </p>
                            <p className="text-sm text-slate-200">{vendor.legal_name || '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                {t('form.registration_id')}
                            </p>
                            <p className="text-sm text-slate-200">{vendor.registration_id || '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                {t('form.country')}
                            </p>
                            <p className="text-sm text-slate-200">{vendor.country || '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                {t('form.website')}
                            </p>
                            <p className="text-sm text-slate-200">{vendor.website || '—'}</p>
                        </div>
                    </div>

                    {vendor.description && (
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                {t('form.description')}
                            </p>
                            <p className="text-sm text-slate-200 whitespace-pre-wrap">
                                {vendor.description}
                            </p>
                        </div>
                    )}
                </section>

                <section className="glass-card p-6 space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">
                        {t('detail.ownership')}
                    </h3>

                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <Building2 className="h-4 w-4 text-accent" />
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                    {t('columns.department')}
                                </p>
                                <p className="text-sm text-slate-200">
                                    {vendor.department_name || t('labels.unassigned')}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <User className="h-4 w-4 text-accent" />
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                    {t('columns.owner')}
                                </p>
                                <p className="text-sm text-slate-200">
                                    {vendor.outsourcing_owner_name || '—'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="h-4 w-4 text-accent" />
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                    {t('form.process')}
                                </p>
                                <p className="text-sm text-slate-200">
                                    {vendor.process}
                                    {vendor.subprocess ? ` / ${vendor.subprocess}` : ''}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <section className="glass-card p-6 space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">
                    {t('detail.classification')}
                </h3>

                <div className="flex flex-wrap gap-2">
                    {badge(
                        `${t('columns.risk_score')}: ${vendor.risk_score_1_5}/5`,
                        'text-amber-400 bg-amber-400/10 border-amber-400/20'
                    )}
                    {vendor.supports_important_core_insurance_function &&
                        badge(
                            t('flags.supports_core_function'),
                            'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                        )}
                    {vendor.dora_relevant &&
                        badge(
                            t('flags.dora_relevant'),
                            'text-blue-400 bg-blue-400/10 border-blue-400/20'
                        )}
                    {vendor.is_significant_vendor &&
                        badge(
                            t('flags.significant_vendor'),
                            'text-orange-400 bg-orange-400/10 border-orange-400/20'
                        )}
                    {vendor.status !== 'active' &&
                        badge(
                            t(`status.${vendor.status}`, vendor.status),
                            'text-slate-300 bg-white/5 border-white/10'
                        )}
                </div>
            </section>
        </>
    );
}
