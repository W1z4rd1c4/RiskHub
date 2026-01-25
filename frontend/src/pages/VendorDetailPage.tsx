import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Edit, XCircle, Building2, User, ShieldAlert } from 'lucide-react';
import { vendorApi } from '@/services/vendorApi';
import type { Vendor } from '@/types/vendor';
import { VendorForm } from '@/components/VendorForm';
import { PermissionGate } from '@/components/PermissionGate';
import { useAuth } from '@/contexts/AuthContext';

type VendorDetailMode = 'view' | 'edit' | 'new';

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
    const { t } = useTranslation('vendors');
    const { user, hasPermission } = useAuth();

    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [isLoading, setIsLoading] = useState(mode !== 'new');
    const [error, setError] = useState<string | null>(null);

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
            setError(t('errors.not_found', 'Vendor not found'));
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
                            <h1 className="text-2xl font-bold text-white">{t('actions.new', 'New Vendor')}</h1>
                            <p className="text-slate-500 font-medium">{t('subtitle', 'Third-party vendor catalog')}</p>
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
                <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">{t('labels.loading', 'Loading...')}</p>
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
                    <h3 className="text-xl font-bold text-white uppercase tracking-tight">{t('errors.vendor_not_found', 'Vendor not found')}</h3>
                    <p className="text-slate-500 mt-2 font-medium">{error || t('errors.not_found', 'Not found')}</p>
                </div>
                <button
                    onClick={() => navigate('/vendors')}
                    className="mt-4 px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-all flex items-center gap-2"
                >
                    <ArrowLeft className="h-4 w-4" /> {t('title', 'Vendors')}
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
                            <h1 className="text-2xl font-bold text-white">{t('actions.edit', 'Edit Vendor')}</h1>
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

                {canEdit && (
                    <PermissionGate resource="vendors" action="read">
                        <button
                            onClick={() => navigate(`/vendors/${vendor.id}/edit`)}
                            className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors flex items-center gap-2"
                        >
                            <Edit className="h-4 w-4" />
                            {t('actions.edit', 'Edit')}
                        </button>
                    </PermissionGate>
                )}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <section className="glass-card p-6 space-y-4 lg:col-span-2">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('detail.overview', 'Overview')}</h3>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.legal_name', 'Legal Name')}</p>
                            <p className="text-sm text-slate-200">{vendor.legal_name || '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.registration_id', 'Registration ID')}</p>
                            <p className="text-sm text-slate-200">{vendor.registration_id || '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.country', 'Country')}</p>
                            <p className="text-sm text-slate-200">{vendor.country || '—'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.website', 'Website')}</p>
                            <p className="text-sm text-slate-200">{vendor.website || '—'}</p>
                        </div>
                    </div>

                    {vendor.description && (
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.description', 'Description')}</p>
                            <p className="text-sm text-slate-200 whitespace-pre-wrap">{vendor.description}</p>
                        </div>
                    )}
                </section>

                <section className="glass-card p-6 space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('detail.ownership', 'Ownership')}</h3>

                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <Building2 className="h-4 w-4 text-accent" />
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('columns.department', 'Department')}</p>
                                <p className="text-sm text-slate-200">{vendor.department_name || t('labels.unassigned', 'Unassigned')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <User className="h-4 w-4 text-accent" />
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('columns.owner', 'Owner')}</p>
                                <p className="text-sm text-slate-200">{vendor.outsourcing_owner_name || '—'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <ShieldAlert className="h-4 w-4 text-accent" />
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('form.process', 'Process')}</p>
                                <p className="text-sm text-slate-200">{vendor.process}{vendor.subprocess ? ` / ${vendor.subprocess}` : ''}</p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <section className="glass-card p-6 space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('detail.classification', 'Classification')}</h3>

                <div className="flex flex-wrap gap-2">
                    {badge(`${t('columns.risk_score', 'Risk Score')}: ${vendor.risk_score_1_5}/5`, 'text-amber-400 bg-amber-400/10 border-amber-400/20')}
                    {vendor.supports_important_core_insurance_function && badge(t('flags.supports_core_function', 'Core function'), 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20')}
                    {vendor.dora_relevant && badge(t('flags.dora_relevant', 'DORA'), 'text-blue-400 bg-blue-400/10 border-blue-400/20')}
                    {vendor.is_significant_vendor && badge(t('flags.significant_vendor', 'Significant'), 'text-orange-400 bg-orange-400/10 border-orange-400/20')}
                    {vendor.status !== 'active' && badge(t(`status.${vendor.status}`, vendor.status), 'text-slate-300 bg-white/5 border-white/10')}
                </div>
            </section>
        </div>
    );
}

