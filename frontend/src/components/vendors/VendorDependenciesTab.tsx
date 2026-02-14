import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import type { Vendor } from '@/types/vendor';
import type { VendorDependenciesResponse, VendorRelationshipType } from '@/types/vendorDependency';
import { vendorDependencyApi } from '@/services/vendorDependencyApi';
import { vendorApi } from '@/services/vendorApi';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { VendorDependencyGraph } from './VendorDependencyGraph';

interface VendorDependenciesTabProps {
    vendor: Vendor;
    canEdit: boolean; // owner or vendors:write
}

export function VendorDependenciesTab({ vendor, canEdit }: VendorDependenciesTabProps) {
    const { t } = useTranslation('vendors');
    const [data, setData] = useState<VendorDependenciesResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [allVendors, setAllVendors] = useState<Vendor[]>([]);
    const [newRelatedId, setNewRelatedId] = useState<string>('');
    const [newRelType, setNewRelType] = useState<VendorRelationshipType>('subcontractor');

    const [newServiceName, setNewServiceName] = useState('');

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const [deps, vendorList] = await Promise.all([
                vendorDependencyApi.getVendorDependencies(vendor.id),
                vendorApi.getVendors({ skip: 0, limit: 100 }),
            ]);
            setData(deps);
            setAllVendors(vendorList.items);
        } catch (err) {
            console.error('Failed to load vendor dependencies:', err);
        } finally {
            setIsLoading(false);
        }
    }, [vendor.id]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const vendorOptions = useMemo(
        () =>
            allVendors
                .filter((v) => v.id !== vendor.id)
                .map((v) => ({ value: String(v.id), label: v.name })),
        [allVendors, vendor.id],
    );

    const addRelationship = async () => {
        if (!newRelatedId) return;
        try {
            setIsSaving(true);
            await vendorDependencyApi.createRelationship(vendor.id, {
                related_vendor_id: Number(newRelatedId),
                relationship_type: newRelType,
            });
            setNewRelatedId('');
            await refresh();
        } catch (err) {
            console.error('Failed to create relationship:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const addService = async () => {
        if (!newServiceName.trim()) return;
        try {
            setIsSaving(true);
            await vendorDependencyApi.createService(vendor.id, { service_name: newServiceName.trim() });
            setNewServiceName('');
            await refresh();
        } catch (err) {
            console.error('Failed to create service:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const addDependency = async (serviceId: number) => {
        const fn = prompt(t('dependencies.prompt_function'))?.trim();
        if (!fn) return;
        try {
            setIsSaving(true);
            await vendorDependencyApi.createDependency(serviceId, { supported_function_name: fn });
            await refresh();
        } catch (err) {
            console.error('Failed to create dependency:', err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="glass-card p-6 space-y-6">
            <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t('tabs.dependencies')}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                    {t('dependencies.subtitle')}
                </p>
            </div>

            {isLoading ? (
                <div className="flex items-center gap-3 text-slate-500 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : !data ? (
                <div className="text-slate-500 font-medium">—</div>
            ) : (
                <div className="space-y-6">
                    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-2">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            {t('dependencies.concentration.title')}
                        </p>
                        <p className="text-lg text-white font-bold">
                            {t('dependencies.concentration.score')}: {data.concentration.score}/10
                        </p>
                        <div className="space-y-1">
                            {data.concentration.flags.length === 0 ? (
                                <p className="text-xs text-slate-500 font-medium">
                                    {t('dependencies.concentration.no_flags')}
                                </p>
                            ) : (
                                data.concentration.flags.map((f) => (
                                    <p key={f.key} className="text-xs text-slate-300 font-medium">
                                        • {f.reason}
                                    </p>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <div className="space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">
                                {t('dependencies.relationships.title')}
                            </h4>

                            {canEdit && (
                                <div className="p-3 bg-white/[0.02] border border-white/10 rounded-2xl flex flex-col gap-3">
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <ThemedSelect
                                            value={newRelatedId}
                                            onValueChange={setNewRelatedId}
                                            options={vendorOptions}
                                            placeholder={t('dependencies.relationships.select_vendor')}
                                        />
                                        <ThemedSelect
                                            value={newRelType}
                                            onValueChange={(v) => setNewRelType(v as VendorRelationshipType)}
                                            options={[
                                                { value: 'subcontractor', label: t('dependencies.relationships.type.subcontractor') },
                                                { value: 'reseller', label: t('dependencies.relationships.type.reseller') },
                                                { value: 'parent_company', label: t('dependencies.relationships.type.parent_company') },
                                                { value: 'other', label: t('dependencies.relationships.type.other') },
                                            ]}
                                            placeholder="Type"
                                        />
                                    </div>
                                    <button
                                        onClick={addRelationship}
                                        disabled={!newRelatedId || isSaving}
                                        className="px-4 py-2 bg-accent text-white rounded-xl font-bold hover:bg-accent/90 transition-colors disabled:opacity-60 flex items-center gap-2 justify-center"
                                    >
                                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                        {t('dependencies.relationships.actions.add')}
                                    </button>
                                </div>
                            )}

                            {data.relationships.length === 0 ? (
                                <p className="text-sm text-slate-500 font-medium">
                                    {t('dependencies.relationships.empty')}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {data.relationships.map((r) => (
                                        <div key={r.id} className="p-3 bg-white/[0.02] border border-white/10 rounded-2xl flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-white font-bold">{r.related_vendor_name ?? t('common:fallbacks.unknown_vendor')}</p>
                                                <p className="text-xs text-slate-500 font-medium">{r.relationship_type}</p>
                                            </div>
                                            {canEdit && (
                                                <button
                                                    onClick={async () => {
                                                        if (!confirm(t('dependencies.confirm_delete'))) return;
                                                        await vendorDependencyApi.deleteRelationship(r.id);
                                                        await refresh();
                                                    }}
                                                    className="p-2 text-rose-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 pt-2">
                                {t('dependencies.graph.title')}
                            </h4>
                            <VendorDependencyGraph root={data.relationship_tree} />
                        </div>

                        <div className="space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">
                                {t('dependencies.services.title')}
                            </h4>

                            {canEdit && (
                                <div className="p-3 bg-white/[0.02] border border-white/10 rounded-2xl space-y-3">
                                    <input
                                        value={newServiceName}
                                        onChange={(e) => setNewServiceName(e.target.value)}
                                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium"
                                        placeholder={t('dependencies.services.service_placeholder')}
                                    />
                                    <button
                                        onClick={addService}
                                        disabled={!newServiceName.trim() || isSaving}
                                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center gap-2 justify-center"
                                    >
                                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        {t('dependencies.services.actions.add_service')}
                                    </button>
                                </div>
                            )}

                            {data.services.length === 0 ? (
                                <p className="text-sm text-slate-500 font-medium">
                                    {t('dependencies.services.empty')}
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {data.services.map((s) => (
                                        <div key={s.id} className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm text-white font-bold">{s.service_name}</p>
                                                    {s.notes && <p className="text-xs text-slate-500 font-medium">{s.notes}</p>}
                                                </div>
                                                {canEdit && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => addDependency(s.id)}
                                                            className="px-3 py-2 bg-accent/20 border border-accent/30 text-accent rounded-xl font-bold hover:bg-accent/30 transition-colors flex items-center gap-2"
                                                        >
                                                            <Plus className="h-4 w-4" />
                                                            {t('dependencies.services.actions.add_dependency')}
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (!confirm(t('dependencies.confirm_delete'))) return;
                                                                await vendorDependencyApi.deleteService(s.id);
                                                                await refresh();
                                                            }}
                                                            className="p-2 text-rose-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {s.dependencies.length === 0 ? (
                                                <p className="text-xs text-slate-500 font-medium">
                                                    {t('dependencies.services.no_dependencies')}
                                                </p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {s.dependencies.map((d) => (
                                                        <div key={d.id} className="p-3 bg-white/[0.02] border border-white/10 rounded-xl flex items-center justify-between">
                                                            <div>
                                                                <p className="text-sm text-slate-200 font-bold">{d.supported_function_name || '—'}</p>
                                                                <p className="text-xs text-slate-500 font-medium">
                                                                    {d.department_name || '—'} {d.risk_name ? `· ${d.risk_name}` : ''}
                                                                </p>
                                                            </div>
                                                            {canEdit && (
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!confirm(t('dependencies.confirm_delete'))) return;
                                                                        await vendorDependencyApi.deleteDependency(d.id);
                                                                        await refresh();
                                                                    }}
                                                                    className="p-2 text-rose-300 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
