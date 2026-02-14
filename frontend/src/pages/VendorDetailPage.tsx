import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from '@/i18n/hooks';
import { ArrowLeft, Edit, XCircle, Building2, User, ShieldAlert, AlertTriangle, Link2, CheckSquare, ClipboardList, CalendarClock, FileCheck2, Shield, AlertOctagon, ClipboardCheck, Activity, Radar, RotateCcw, FileText } from 'lucide-react';
import { vendorApi } from '@/services/vendorApi';
import type { Vendor } from '@/types/vendor';
import { VendorForm } from '@/components/VendorForm';
import { PermissionGate } from '@/components/PermissionGate';
import { useAuth } from '@/contexts/AuthContext';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { VendorRiskFactorsTab } from '@/components/vendors/VendorRiskFactorsTab';
import { VendorLinkedRisksTab } from '@/components/vendors/VendorLinkedRisksTab';
import { VendorLinkedControlsTab } from '@/components/vendors/VendorLinkedControlsTab';
import { VendorAssessmentsTab } from '@/components/vendors/VendorAssessmentsTab';
import { VendorScheduleTab } from '@/components/vendors/VendorScheduleTab';
import { VendorContractControlsTab } from '@/components/vendors/VendorContractControlsTab';
import { VendorResilienceTab } from '@/components/vendors/VendorResilienceTab';
import { VendorDependenciesTab } from '@/components/vendors/VendorDependenciesTab';
import { VendorIncidentsTab } from '@/components/vendors/VendorIncidentsTab';
import { VendorRemediationTab } from '@/components/vendors/VendorRemediationTab';
import { VendorSLATab } from '@/components/vendors/VendorSLATab';
import { VendorSignalsTab } from '@/components/vendors/VendorSignalsTab';

type VendorDetailMode = 'view' | 'edit' | 'new';
type VendorTabView =
    | 'risk_factors'
    | 'linked_risks'
    | 'linked_controls'
    | 'assessments'
    | 'schedule'
    | 'contract_controls'
    | 'resilience'
    | 'dependencies'
    | 'incidents'
    | 'remediation'
    | 'sla'
    | 'signals';

interface VendorDetailPageProps {
    mode?: VendorDetailMode;
}

function badge(text: string, className: string) {
    return (
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${className}`}>
            {text}
        </span>
    );
}

export function VendorDetailPage({ mode = 'view' }: VendorDetailPageProps) {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t } = useTranslation('vendors');
    const { t: tIssues } = useTranslation('issues');
    const { user, hasPermission } = useAuth();

    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [isLoading, setIsLoading] = useState(mode !== 'new');
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<VendorTabView>('risk_factors');
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

    const selectTab = (tab: VendorTabView) => {
        setActiveTab(tab);
        const next = new URLSearchParams(searchParams);
        next.set('tab', tab);
        setSearchParams(next, { replace: true });
    };

    useEffect(() => {
        const raw = searchParams.get('tab');
        if (!raw) return;
        const allowed: Set<string> = new Set([
            'risk_factors',
            'linked_risks',
            'linked_controls',
            'assessments',
            'schedule',
            'contract_controls',
            'resilience',
            'dependencies',
            'incidents',
            'remediation',
            'sla',
            'signals',
        ]);
        if (allowed.has(raw)) {
            setActiveTab(raw as VendorTabView);
        }
    }, [searchParams]);

    const fetchVendor = useCallback(async () => {
        if (!id) return;
        const vendorId = Number(id);
        if (!vendorId) return;

        try {
            setIsLoading(true);
            const data = await vendorApi.getVendor(vendorId);
            setVendor(data);
            setError(null);
        } catch (err) {
            console.error('Error fetching vendor:', err);
            setError(t('errors.not_found'));
        } finally {
            setIsLoading(false);
        }
    }, [id, t]);

    useEffect(() => {
        if (mode === 'new') return;
        fetchVendor();
    }, [fetchVendor, mode]);

    const canEditByOwnership = !!(vendor && user?.id === vendor.outsourcing_owner_user_id);
    const canEditByPermission = hasPermission('vendors', 'write');
    const canEdit = canEditByPermission || canEditByOwnership;

    if (mode === 'new') {
        return (
            <div className="space-y-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/vendors')}
                            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4 text-slate-300" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-white">{t('actions.new')}</h1>
                            <p className="text-slate-500 font-medium">{t('subtitle')}</p>
                        </div>
                    </div>
                </div>

                <VendorForm
                    onSaved={(saved) => navigate(`/vendors/${saved.id}`)}
                    onCancel={() => navigate('/vendors')}
                />
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">{t('labels.loading')}</p>
            </div>
        );
    }

    if (error || !vendor) {
        return (
            <div className="glass-card flex flex-col items-center justify-center p-20 text-center gap-4">
                <div className="bg-rose-500/20 p-4 rounded-full">
                    <XCircle className="h-10 w-10 text-rose-500" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">{t('errors.vendor_not_found')}</h3>
                    <p className="text-slate-500 mt-2 font-medium">{error || t('errors.not_found')}</p>
                </div>
                <button
                    onClick={() => navigate('/vendors')}
                    className="mt-4 px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-all flex items-center gap-2"
                >
                    <ArrowLeft className="h-4 w-4" /> {t('title')}
                </button>
            </div>
        );
    }

    if (mode === 'edit') {
        return (
            <div className="space-y-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(`/vendors/${vendor.id}`)}
                            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4 text-slate-300" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-white">{t('actions.edit')}</h1>
                            <p className="text-slate-500 font-medium">{vendor.name}</p>
                        </div>
                    </div>
                </div>

                <VendorForm
                    initialData={vendor}
                    isEdit
                    onSaved={(saved) => navigate(`/vendors/${saved.id}`)}
                    onCancel={() => navigate(`/vendors/${vendor.id}`)}
                />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/vendors')}
                        className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4 text-slate-300" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-white">{vendor.name}</h1>
                        <p className="text-slate-500 font-medium">{t(`type.${vendor.vendor_type}`, vendor.vendor_type)}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <PermissionGate resource="issues" action="write">
                        <button
                            onClick={() => setIsIssueModalOpen(true)}
                            className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors flex items-center gap-2"
                        >
                            <FileText className="h-4 w-4" />
                            {tIssues('actions.new_issue')}
                        </button>
                    </PermissionGate>
                    {canEdit && (
                        <PermissionGate resource="vendors" action="read">
                            <button
                                onClick={() => navigate(`/vendors/${vendor.id}/edit`)}
                                className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors flex items-center gap-2"
                            >
                                <Edit className="h-4 w-4" />
                                {t('actions.edit')}
                            </button>
                        </PermissionGate>
                    )}
                    {vendor.status === 'inactive' && hasPermission('vendors', 'delete') && (
                        <button
                            onClick={async () => {
                                try {
                                    await vendorApi.restoreVendor(vendor.id);
                                    await fetchVendor();
                                } catch (err) {
                                    console.error('Error restoring vendor:', err);
                                }
                            }}
                            className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors flex items-center gap-2"
                        >
                            <RotateCcw className="h-4 w-4" />
                            {t('actions.unarchive')}
                        </button>
                    )}
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <section className="glass-card p-6 space-y-4 lg:col-span-2">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('detail.overview')}</h3>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.legal_name')}</p>
                            <p className="text-sm text-slate-200">{vendor.legal_name || '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.registration_id')}</p>
                            <p className="text-sm text-slate-200">{vendor.registration_id || '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.country')}</p>
                            <p className="text-sm text-slate-200">{vendor.country || '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.website')}</p>
                            <p className="text-sm text-slate-200">{vendor.website || '—'}</p>
                        </div>
                    </div>

                    {vendor.description && (
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.description')}</p>
                            <p className="text-sm text-slate-200 whitespace-pre-wrap">{vendor.description}</p>
                        </div>
                    )}
                </section>

                <section className="glass-card p-6 space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('detail.ownership')}</h3>

                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <Building2 className="h-4 w-4 text-accent" />
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('columns.department')}</p>
                                <p className="text-sm text-slate-200">{vendor.department_name || t('labels.unassigned')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <User className="h-4 w-4 text-accent" />
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('columns.owner')}</p>
                                <p className="text-sm text-slate-200">{vendor.outsourcing_owner_name || '—'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="h-4 w-4 text-accent" />
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.process')}</p>
                                <p className="text-sm text-slate-200">{vendor.process}{vendor.subprocess ? ` / ${vendor.subprocess}` : ''}</p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <section className="glass-card p-6 space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('detail.classification')}</h3>

                <div className="flex flex-wrap gap-2">
                    {badge(`${t('columns.risk_score')}: ${vendor.risk_score_1_5}/5`, 'text-amber-400 bg-amber-400/10 border-amber-400/20')}
                    {vendor.supports_important_core_insurance_function && badge(t('flags.supports_core_function'), 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20')}
                    {vendor.dora_relevant && badge(t('flags.dora_relevant'), 'text-blue-400 bg-blue-400/10 border-blue-400/20')}
                    {vendor.is_significant_vendor && badge(t('flags.significant_vendor'), 'text-orange-400 bg-orange-400/10 border-orange-400/20')}
                    {vendor.status !== 'active' && badge(t(`status.${vendor.status}`, vendor.status), 'text-slate-300 bg-white/5 border-white/10')}
                </div>
            </section>

            <div className="flex items-center gap-2 border-b border-white/10">
                <button
                    onClick={() => selectTab('risk_factors')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'risk_factors'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <AlertTriangle className="h-4 w-4 inline mr-2" />
                    {t('tabs.risk_factors')}
                </button>
                <button
                    onClick={() => selectTab('linked_risks')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'linked_risks'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <Link2 className="h-4 w-4 inline mr-2" />
                    {t('tabs.linked_risks')}
                </button>
                <button
                    onClick={() => selectTab('linked_controls')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'linked_controls'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <CheckSquare className="h-4 w-4 inline mr-2" />
                    {t('tabs.linked_controls')}
                </button>
                <button
                    onClick={() => selectTab('assessments')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'assessments'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <ClipboardList className="h-4 w-4 inline mr-2" />
                    {t('tabs.assessments')}
                </button>
                <button
                    onClick={() => selectTab('schedule')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'schedule'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <CalendarClock className="h-4 w-4 inline mr-2" />
                    {t('tabs.schedule')}
                </button>
                <button
                    onClick={() => selectTab('contract_controls')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'contract_controls'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <FileCheck2 className="h-4 w-4 inline mr-2" />
                    {t('tabs.contract_controls')}
                </button>
                <button
                    onClick={() => selectTab('resilience')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'resilience'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <Shield className="h-4 w-4 inline mr-2" />
                    {t('tabs.resilience')}
                </button>
                <button
                    onClick={() => selectTab('dependencies')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'dependencies'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <AlertTriangle className="h-4 w-4 inline mr-2" />
                    {t('tabs.dependencies')}
                </button>
                <button
                    onClick={() => selectTab('incidents')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'incidents'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <AlertOctagon className="h-4 w-4 inline mr-2" />
                    {t('tabs.incidents')}
                </button>
                <button
                    onClick={() => selectTab('remediation')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'remediation'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <ClipboardCheck className="h-4 w-4 inline mr-2" />
                    {t('tabs.remediation')}
                </button>
                <button
                    onClick={() => selectTab('sla')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'sla'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <Activity className="h-4 w-4 inline mr-2" />
                    {t('tabs.sla')}
                </button>
                <button
                    onClick={() => selectTab('signals')}
                    className={`px-6 py-3 font-bold transition-all ${activeTab === 'signals'
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-slate-500 hover:text-white'
                        }`}
                >
                    <Radar className="h-4 w-4 inline mr-2" />
                    {t('tabs.signals')}
                </button>
            </div>

            {activeTab === 'risk_factors' && (
                <VendorRiskFactorsTab
                    vendorId={vendor.id}
                    canEdit={canEdit}
                />
            )}

            {activeTab === 'linked_risks' && (
                <VendorLinkedRisksTab
                    vendorId={vendor.id}
                    canEdit={canEdit}
                    onNavigateToRisk={(riskId) => navigate(`/risks/${riskId}`)}
                />
            )}

            {activeTab === 'linked_controls' && (
                <VendorLinkedControlsTab
                    vendorId={vendor.id}
                    canEdit={canEdit}
                    onNavigateToControl={(controlId) => navigate(`/controls/${controlId}`)}
                />
            )}

            {activeTab === 'assessments' && (
                <VendorAssessmentsTab
                    vendor={vendor}
                    canEdit={canEdit}
                />
            )}

            {activeTab === 'schedule' && (
                <VendorScheduleTab
                    vendorId={vendor.id}
                    canEdit={canEdit}
                />
            )}

            {activeTab === 'contract_controls' && (
                <VendorContractControlsTab
                    vendorId={vendor.id}
                    canEdit={canEditByOwnership || hasPermission('vendor_contracts', 'write')}
                />
            )}

            {activeTab === 'resilience' && (
                <VendorResilienceTab
                    vendorId={vendor.id}
                    canEdit={canEdit}
                />
            )}

            {activeTab === 'dependencies' && (
                <VendorDependenciesTab
                    vendor={vendor}
                    canEdit={canEdit}
                />
            )}

            {activeTab === 'incidents' && (
                <VendorIncidentsTab
                    vendorId={vendor.id}
                    canEdit={canEdit}
                />
            )}

            {activeTab === 'remediation' && (
                <VendorRemediationTab
                    vendorId={vendor.id}
                    canEdit={canEdit}
                />
            )}

            {activeTab === 'sla' && (
                <VendorSLATab
                    vendorId={vendor.id}
                    canEditVendor={canEdit}
                />
            )}

            {activeTab === 'signals' && (
                <VendorSignalsTab
                    vendorId={vendor.id}
                    canRefresh={canEdit}
                />
            )}

            <IssueQuickCreateModal
                isOpen={isIssueModalOpen}
                onClose={() => setIsIssueModalOpen(false)}
                contextEntityType="vendor"
                contextEntityId={vendor.id}
                contextEntityLabel={vendor.name}
                onCreated={(issue) => navigate(`/issues/${issue.id}`)}
            />
        </div>
    );
}
