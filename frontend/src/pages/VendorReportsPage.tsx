import { useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { Download, FileSpreadsheet } from 'lucide-react';
import { vendorReportApi } from '@/services/vendorReportApi';
import { useAuth } from '@/contexts/AuthContext';
import { PermissionGate } from '@/components/PermissionGate';

export function VendorReportsPage() {
    const { t } = useTranslation('vendors');
    const { user } = useAuth();
    const [year, setYear] = useState<number>(new Date().getFullYear());
    const [isDownloading, setIsDownloading] = useState(false);

    const canAccessRole = useMemo(() => {
        const role = user?.role;
        return role === 'cro' || role === 'risk_manager' || role === 'compliance' || role === 'internal_audit';
    }, [user?.role]);

    const download = async (fn: () => Promise<void>) => {
        try {
            setIsDownloading(true);
            await fn();
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <PermissionGate resource="reports" action="read">
            <div className="space-y-8">
                <div>
                    <h1 className="text-2xl font-bold text-white">{t('reports.title', 'Vendor Reports')}</h1>
                    <p className="text-slate-500 font-medium">{t('reports.subtitle', 'Exports for annual vendor risk management reporting and DORA register.')}</p>
                </div>

                {!canAccessRole ? (
                    <div className="glass-card p-6">
                        <p className="text-slate-300 font-medium">{t('reports.not_authorized', 'You do not have access to vendor reports.')}</p>
                    </div>
                ) : (
                    <div className="grid gap-6 lg:grid-cols-2">
                        <section className="glass-card p-6 space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Download className="h-4 w-4" />
                                {t('reports.annual.title', 'Annual Vendor Management Report')}
                            </h3>

                            <div className="flex items-center gap-3">
                                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                    {t('reports.annual.year', 'Year')}
                                </label>
                                <input
                                    type="number"
                                    value={year}
                                    onChange={(e) => setYear(Number(e.target.value))}
                                    className="w-28 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-mono"
                                    min={2000}
                                    max={2100}
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    disabled={isDownloading}
                                    onClick={() => download(() => vendorReportApi.downloadAnnual(year, 'xlsx'))}
                                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 font-bold hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center gap-2"
                                >
                                    <FileSpreadsheet className="h-4 w-4" />
                                    {t('reports.annual.download_excel', 'Download Excel')}
                                </button>
                            </div>
                        </section>

                        <section className="glass-card p-6 space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <FileSpreadsheet className="h-4 w-4" />
                                {t('reports.dora.title', 'DORA Register of Information')}
                            </h3>
                            <p className="text-sm text-slate-300 font-medium">
                                {t('reports.dora.subtitle', 'Export the minimum DORA register dataset for vendor arrangements.')}
                            </p>
                            <button
                                disabled={isDownloading}
                                onClick={() => download(() => vendorReportApi.downloadDoraRegister())}
                                className="px-4 py-2 rounded-xl bg-accent/20 border border-accent/30 text-accent font-bold hover:bg-accent/30 transition-colors disabled:opacity-60 flex items-center gap-2 w-fit"
                            >
                                <Download className="h-4 w-4" />
                                {t('reports.dora.download', 'Download Excel')}
                            </button>
                        </section>
                    </div>
                )}
            </div>
        </PermissionGate>
    );
}
