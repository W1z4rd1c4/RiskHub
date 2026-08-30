import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { Download, FileSpreadsheet } from 'lucide-react';
import { vendorReportApi } from '@/services/vendorReportApi';
import { departmentApi, type DepartmentSummary } from '@/services/departmentApi';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { logError } from '@/services/logger';
import { useVendorReportCapabilities } from '@/hooks/useVendorReportCapabilities';

type AnnualDownloadRequest = {
    year: number;
    departmentId: number | null;
};

type DoraDownloadRequest = {
    departmentId: number | null;
};

export function VendorReportsPage() {
    const { t } = useTranslation('vendors');
    const { t: tCommon } = useTranslation('common');
    const [year, setYear] = useState<number>(new Date().getFullYear());
    const [departmentId, setDepartmentId] = useState<number | null>(null);
    const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
    const vendorCapability = useVendorReportCapabilities();
    const capabilities = vendorCapability.capabilities;
    const isCapabilitiesLoading = vendorCapability.state === 'pending';
    const capabilitiesUnavailable = vendorCapability.state === 'unavailable';
    const [isAnnualDownloading, setIsAnnualDownloading] = useState(false);
    const [annualError, setAnnualError] = useState<AnnualDownloadRequest | null>(null);
    const [isDoraDownloading, setIsDoraDownloading] = useState(false);
    const [doraError, setDoraError] = useState<DoraDownloadRequest | null>(null);

    const canReadReports = resolveCapabilityFlag(capabilities, 'can_read');
    const canDownloadAnnual = resolveCapabilityFlag(capabilities, 'can_download_annual_report');
    const canDownloadDora = resolveCapabilityFlag(capabilities, 'can_download_dora_register');
    const canUseDepartmentFilter = resolveCapabilityFlag(capabilities, 'can_use_department_filter');

    const downloadAnnual = async (request: AnnualDownloadRequest) => {
        setIsAnnualDownloading(true);
        setAnnualError(null);
        try {
            await vendorReportApi.downloadAnnual(request.year, 'csv', request.departmentId);
        } catch (error) {
            logError('Failed to download annual vendor report.', error);
            setAnnualError(request);
        } finally {
            setIsAnnualDownloading(false);
        }
    };

    const downloadDora = async (request: DoraDownloadRequest) => {
        setIsDoraDownloading(true);
        setDoraError(null);
        try {
            await vendorReportApi.downloadDoraRegister(request.departmentId);
        } catch (error) {
            logError('Failed to download DORA register.', error);
            setDoraError(request);
        } finally {
            setIsDoraDownloading(false);
        }
    };

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
            <label htmlFor={selectId} className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {tCommon('labels.department')}
            </label>
            <select
                id={selectId}
                value={departmentId ?? ''}
                onChange={(event) => setDepartmentId(event.target.value ? Number(event.target.value) : null)}
                className="min-w-48 bg-nested border border-border rounded-xl px-3 py-2 text-foreground font-medium"
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

    let reportContent: ReactNode;
    if (isCapabilitiesLoading) {
        reportContent = (
            <div className="glass-card p-6">
                <p className="text-foreground font-medium">{t('labels.loading')}</p>
            </div>
        );
    } else if (capabilitiesUnavailable) {
        reportContent = (
            <div role="alert" className="glass-card p-6 flex flex-wrap items-center justify-between gap-4 border-rose-500/30">
                <p className="text-foreground font-medium">{t('reports.unavailable')}</p>
                <button
                    type="button"
                    onClick={vendorCapability.retry}
                    className="px-4 py-2 rounded-xl bg-muted border border-border text-foreground font-bold hover:bg-muted/80 transition-colors"
                >
                    {tCommon('actions.retry')}
                </button>
            </div>
        );
    } else if (!canReadReports) {
        reportContent = (
            <div className="glass-card p-6">
                <p className="text-foreground font-medium">{t('reports.not_authorized')}</p>
            </div>
        );
    } else {
        reportContent = (
            <div className="grid gap-6 lg:grid-cols-2">
                <section className="glass-card p-6 space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <Download className="h-4 w-4" />
                        {t('reports.annual.title')}
                    </h3>

                    <Field
                        id="vendor-report-year"
                        label={t('reports.annual.year')}
                        className="w-28"
                    >
                        {(field) => (
                            <Input
                                {...field}
                                type="number"
                                value={year}
                                onChange={(event) => setYear(Number(event.target.value))}
                                className="font-mono"
                                min={2000}
                                max={2100}
                            />
                        )}
                    </Field>
                    {renderDepartmentSelector('vendor-report-annual-department')}

                    <div className="flex flex-wrap gap-2">
                        {canDownloadAnnual ? (
                            <button
                                type="button"
                                aria-busy={isAnnualDownloading}
                                disabled={isAnnualDownloading}
                                onClick={() => void downloadAnnual({ year, departmentId: effectiveDepartmentId })}
                                className="px-4 py-2 rounded-xl bg-muted border border-border text-foreground font-bold hover:bg-muted/80 transition-colors disabled:opacity-60 flex items-center gap-2"
                            >
                                <FileSpreadsheet className="h-4 w-4" />
                                {t('reports.annual.download_csv')}
                            </button>
                        ) : null}
                    </div>
                    {annualError ? (
                        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                            <p className="text-sm font-semibold text-rose-200">{tCommon('export.errors.failed')}</p>
                            <button
                                type="button"
                                onClick={() => void downloadAnnual(annualError)}
                                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-xs font-bold text-foreground hover:bg-white/15"
                            >
                                {tCommon('actions.retry')}
                            </button>
                        </div>
                    ) : null}
                </section>

                <section className="glass-card p-6 space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4" />
                        {t('reports.dora.title')}
                    </h3>
                    <p className="text-sm text-foreground font-medium">
                        {t('reports.dora.subtitle')}
                    </p>
                    {renderDepartmentSelector('vendor-report-dora-department')}
                    {canDownloadDora ? (
                        <button
                            type="button"
                            aria-busy={isDoraDownloading}
                            disabled={isDoraDownloading}
                            onClick={() => void downloadDora({ departmentId: effectiveDepartmentId })}
                            className="px-4 py-2 rounded-xl bg-accent/10 border border-accent/30 text-accent-text font-bold hover:bg-accent/20 transition-colors disabled:opacity-60 flex items-center gap-2 w-fit"
                        >
                            <Download className="h-4 w-4" />
                            {t('reports.dora.download')}
                        </button>
                    ) : null}
                    {doraError ? (
                        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                            <p className="text-sm font-semibold text-rose-200">{tCommon('export.errors.failed')}</p>
                            <button
                                type="button"
                                onClick={() => void downloadDora(doraError)}
                                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-xs font-bold text-foreground hover:bg-white/15"
                            >
                                {tCommon('actions.retry')}
                            </button>
                        </div>
                    ) : null}
                </section>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-foreground">{t('reports.title')}</h1>
                <p className="text-muted-foreground font-medium">{t('reports.subtitle')}</p>
            </div>

            {reportContent}
        </div>
    );
}

export default VendorReportsPage;
