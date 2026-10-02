import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { Download, FileSpreadsheet } from 'lucide-react';
import { vendorReportApi } from '@/services/vendorReportApi';
import { departmentApi, type DepartmentSummary } from '@/services/departmentApi';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { parseBoundedInteger } from '@/lib/boundedInteger';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { AccessDeniedState, ErrorState, LoadingState } from '@/components/ui/state';
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
    const [year, setYear] = useState(String(new Date().getFullYear()));
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
    const annualReportYear = parseBoundedInteger(year, 2000, 2100);

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
        <Field id={selectId} label={tCommon('labels.department')} className="max-w-xs">
            {(field) => (
                <NativeSelect
                    {...field}
                    value={departmentId ?? ''}
                    onChange={(event) => setDepartmentId(event.target.value ? Number(event.target.value) : null)}
                >
                    <option value="">{tCommon('filters.all_departments')}</option>
                    {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                            {dept.name}
                        </option>
                    ))}
                </NativeSelect>
            )}
        </Field>
    ) : null;

    let reportContent: ReactNode;
    if (isCapabilitiesLoading) {
        reportContent = (
            <Card>
                <LoadingState layout="section" label={t('labels.loading')} />
            </Card>
        );
    } else if (capabilitiesUnavailable) {
        reportContent = (
            <Card>
                <ErrorState
                    layout="section"
                    message={t('reports.unavailable')}
                    onRetry={vendorCapability.retry}
                />
            </Card>
        );
    } else if (!canReadReports) {
        reportContent = (
            <Card>
                <AccessDeniedState
                    layout="section"
                    descriptionKey="reports.not_authorized"
                    ns="vendors"
                />
            </Card>
        );
    } else {
        reportContent = (
            <div className="grid gap-6 lg:grid-cols-2">
                <Card as="section" className="space-y-4">
                    <CardHeader icon={Download} title={t('reports.annual.title')} className="mb-0" />

                    <Field
                        id="vendor-report-year"
                        label={t('reports.annual.year')}
                        error={annualReportYear === null ? t('reports.annual.year_error') : undefined}
                        className="w-28"
                    >
                        {(field) => (
                            <Input
                                {...field}
                                type="number"
                                value={year}
                                onChange={(event) => setYear(event.target.value)}
                                className="font-mono"
                                min={2000}
                                max={2100}
                            />
                        )}
                    </Field>
                    {renderDepartmentSelector('vendor-report-annual-department')}

                    <div className="flex flex-wrap gap-2">
                        {canDownloadAnnual ? (
                            <Button
                                variant="outline"
                                isLoading={isAnnualDownloading}
                                disabled={annualReportYear === null}
                                onClick={() => {
                                    if (annualReportYear !== null) {
                                        void downloadAnnual({ year: annualReportYear, departmentId: effectiveDepartmentId });
                                    }
                                }}
                            >
                                {isAnnualDownloading ? null : <FileSpreadsheet aria-hidden="true" />}
                                {t('reports.annual.download_csv')}
                            </Button>
                        ) : null}
                    </div>
                    {annualError ? (
                        <ErrorState
                            variant="banner"
                            message={tCommon('export.errors.failed')}
                            onRetry={() => void downloadAnnual(annualError)}
                        />
                    ) : null}
                </Card>

                <Card as="section" className="space-y-4">
                    <CardHeader
                        icon={FileSpreadsheet}
                        title={t('reports.dora.title')}
                        description={t('reports.dora.subtitle')}
                        className="mb-0"
                    />
                    {renderDepartmentSelector('vendor-report-dora-department')}
                    {canDownloadDora ? (
                        <Button
                            variant="outline"
                            isLoading={isDoraDownloading}
                            onClick={() => void downloadDora({ departmentId: effectiveDepartmentId })}
                        >
                            {isDoraDownloading ? null : <Download aria-hidden="true" />}
                            {t('reports.dora.download')}
                        </Button>
                    ) : null}
                    {doraError ? (
                        <ErrorState
                            variant="banner"
                            message={tCommon('export.errors.failed')}
                            onRetry={() => void downloadDora(doraError)}
                        />
                    ) : null}
                </Card>
            </div>
        );
    }

    return (
        <PageContainer>
            <PageHeader title={t('reports.title')} description={t('reports.subtitle')} />

            {reportContent}
        </PageContainer>
    );
}

export default VendorReportsPage;
