import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { Download, FileSpreadsheet } from 'lucide-react';
import { vendorReportApi } from '@/services/vendorReportApi';
import { PermissionGate } from '@/components/PermissionGate';
import { departmentApi, type DepartmentSummary } from '@/services/departmentApi';
import type { VendorReportCapabilities } from '@/types/vendorReport';

export function VendorReportsPage() {
    const { t } = useTranslation('vendors');
    const { t: tCommon } = useTranslation('common');
    const [year, setYear] = useState<number>(new Date().getFullYear());
    const [departmentId, setDepartmentId] = useState<number | null>(null);
    const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
    const [capabilities, setCapabilities] = useState<VendorReportCapabilities | null>(null);
    const [isCapabilitiesLoading, setIsCapabilitiesLoading] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);

    const canReadReports = capabilities?.can_read === true;
    const canDownloadAnnual = capabilities?.can_download_annual_report === true;
    const canDownloadDora = capabilities?.can_download_dora_register === true;
    const canUseDepartmentFilter = capabilities?.can_use_department_filter === true;

    const download = async (fn: () => Promise<void>) => {
        try {
            setIsDownloading(true);
            await fn();
        } finally {
            setIsDownloading(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        setIsCapabilitiesLoading(true);
        vendorReportApi.getCapabilities()
            .then((data) => {
                if (!cancelled) {
                    setCapabilities(data);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setCapabilities(null);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsCapabilitiesLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!canUseDepartmentFilter) {
            setDepartments([]);
            setDepartmentId(null);
            return;
        }

        let cancelled = false;
        departmentApi.getDepartments()
            .then((items) => {
                if (cancelled) return;
                setDepartments(items);
                if (items.length === 1) {
                    setDepartmentId(items[0].id);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setDepartments([]);
                    setDepartmentId(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [canUseDepartmentFilter]);

    const effectiveDepartmentId = canUseDepartmentFilter ? departmentId : null;

    const renderDepartmentSelector = (selectId: string) => canUseDepartmentFilter && departments.length > 0 ? (
        <div className="flex items-center gap-3">
            <label htmlFor={selectId} className="text-xs font-bold uppercase tracking-widest text-slate-500">
                {tCommon('labels.department')}
            </label>
            <select
                id={selectId}
                value={departmentId ?? ''}
                onChange={(event) => setDepartmentId(event.target.value ? Number(event.target.value) : null)}
                className="min-w-48 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white font-medium"
            >
                <option value="">{tCommon('filters.all_departments')}</option>
                {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                        {dept.name}
                    </option>
                ))}
            </select>
        </div>
    ) : null;

    return (
        <PermissionGate resource="reports" action="read">
            <div className="space-y-8">
                <div>
                    <h1 className="text-2xl font-bold text-white">{t('reports.title')}</h1>
                    <p className="text-slate-500 font-medium">{t('reports.subtitle')}</p>
                </div>

                {isCapabilitiesLoading ? (
                    <div className="glass-card p-6">
                        <p className="text-slate-300 font-medium">{t('labels.loading')}</p>
                    </div>
                ) : !canReadReports ? (
                    <div className="glass-card p-6">
                        <p className="text-slate-300 font-medium">{t('reports.not_authorized')}</p>
                    </div>
                ) : (
                    <div className="grid gap-6 lg:grid-cols-2">
                        <section className="glass-card p-6 space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Download className="h-4 w-4" />
                                {t('reports.annual.title')}
                            </h3>

                            <div className="flex items-center gap-3">
                                <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                                    {t('reports.annual.year')}
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
                            {renderDepartmentSelector('vendor-report-annual-department')}

                            <div className="flex flex-wrap gap-2">
                                {canDownloadAnnual ? (
                                    <button
                                        disabled={isDownloading}
                                        onClick={() => download(() => vendorReportApi.downloadAnnual(year, 'csv', effectiveDepartmentId))}
                                        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-200 font-bold hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center gap-2"
                                    >
                                        <FileSpreadsheet className="h-4 w-4" />
                                        {t('reports.annual.download_csv')}
                                    </button>
                                ) : null}
                            </div>
                        </section>

                        <section className="glass-card p-6 space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <FileSpreadsheet className="h-4 w-4" />
                                {t('reports.dora.title')}
                            </h3>
                            <p className="text-sm text-slate-300 font-medium">
                                {t('reports.dora.subtitle')}
                            </p>
                            {renderDepartmentSelector('vendor-report-dora-department')}
                            {canDownloadDora ? (
                                <button
                                    disabled={isDownloading}
                                    onClick={() => download(() => vendorReportApi.downloadDoraRegister(effectiveDepartmentId))}
                                    className="px-4 py-2 rounded-xl bg-accent/20 border border-accent/30 text-accent font-bold hover:bg-accent/30 transition-colors disabled:opacity-60 flex items-center gap-2 w-fit"
                                >
                                    <Download className="h-4 w-4" />
                                    {t('reports.dora.download')}
                                </button>
                            ) : null}
                        </section>
                    </div>
                )}
            </div>
        </PermissionGate>
    );
}

export default VendorReportsPage;
