import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Network, Plus, Save, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
    VendorActionButton,
    VendorBadge,
    VendorEmptyState,
    VendorInlineMessage,
    VendorSectionHeader,
    VendorSurface,
} from '@/components/vendors/vendorRouteUi';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { vendorDependencyApi } from '@/services/vendorDependencyApi';
import { vendorApi } from '@/services/vendorApi';
import type { Vendor } from '@/types/vendor';
import type {
    VendorDependenciesResponse,
    VendorRelationshipType,
} from '@/types/vendorDependency';

import { VendorDependencyGraph } from './VendorDependencyGraph';

interface VendorDependenciesTabProps {
    vendor: Vendor;
    canEdit: boolean;
}

export function VendorDependenciesTab({ vendor, canEdit }: VendorDependenciesTabProps) {
    const { t } = useTranslation('vendors');
    const [data, setData] = useState<VendorDependenciesResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [allVendors, setAllVendors] = useState<Vendor[]>([]);
    const [newRelatedId, setNewRelatedId] = useState('');
    const [newRelType, setNewRelType] = useState<VendorRelationshipType>('subcontractor');
    const [newServiceName, setNewServiceName] = useState('');
    const [addDependencyServiceId, setAddDependencyServiceId] = useState<number | null>(null);
    const [pendingDelete, setPendingDelete] = useState<{
        kind: 'relationship' | 'service' | 'dependency';
        id: number;
    } | null>(null);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const [dependencies, vendorList] = await Promise.all([
                vendorDependencyApi.getVendorDependencies(vendor.id),
                vendorApi.getVendors({ skip: 0, limit: 100 }),
            ]);
            setData(dependencies);
            setAllVendors(vendorList.items);
            setError(null);
        } catch (err) {
            console.error('Failed to load vendor dependencies:', err);
            setError(t('errors.load_failed'));
        } finally {
            setIsLoading(false);
        }
    }, [t, vendor.id]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const vendorOptions = useMemo(
        () =>
            allVendors
                .filter((item) => item.id !== vendor.id)
                .map((item) => ({ value: String(item.id), label: item.name })),
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
            setError(t('errors.save_failed'));
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
            setError(t('errors.save_failed'));
        } finally {
            setIsSaving(false);
        }
    };

    const addDependency = async (supportedFunctionName?: string) => {
        if (addDependencyServiceId === null) return;
        const functionName = supportedFunctionName?.trim();
        if (!functionName) return;

        try {
            setIsSaving(true);
            await vendorDependencyApi.createDependency(addDependencyServiceId, {
                supported_function_name: functionName,
            });
            await refresh();
        } catch (err) {
            console.error('Failed to create dependency:', err);
            setError(t('errors.save_failed'));
        } finally {
            setIsSaving(false);
            setAddDependencyServiceId(null);
        }
    };

    const handleConfirmDelete = async () => {
        if (!pendingDelete) return;
        try {
            setIsSaving(true);
            if (pendingDelete.kind === 'relationship') {
                await vendorDependencyApi.deleteRelationship(pendingDelete.id);
            } else if (pendingDelete.kind === 'service') {
                await vendorDependencyApi.deleteService(pendingDelete.id);
            } else {
                await vendorDependencyApi.deleteDependency(pendingDelete.id);
            }
            await refresh();
        } catch (err) {
            console.error('Failed to delete vendor dependency item:', err);
            setError(t('errors.save_failed'));
        } finally {
            setIsSaving(false);
            setPendingDelete(null);
        }
    };

    return (
        <VendorSurface className="space-y-6">
            <VendorSectionHeader
                icon={<AlertTriangle className="h-4 w-4" />}
                title={t('tabs.dependencies')}
                description={t('dependencies.subtitle')}
            />

            {isLoading ? (
                <div className="flex items-center gap-3 vendor-muted font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : error ? (
                <VendorInlineMessage tone="danger">{error}</VendorInlineMessage>
            ) : !data ? (
                <VendorInlineMessage>{t('common:fallbacks.not_available')}</VendorInlineMessage>
            ) : (
                <div className="vendor-stack vendor-stack--lg">
                    <div className="vendor-card space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="vendor-section-title">{t('dependencies.concentration.title')}</h3>
                                <p className="vendor-section-description">{t('dependencies.subtitle')}</p>
                            </div>
                            <VendorBadge tone={data.concentration.score >= 7 ? 'danger' : data.concentration.score >= 4 ? 'warn' : 'success'}>
                                {t('dependencies.concentration.score')}: {data.concentration.score}/10
                            </VendorBadge>
                        </div>
                        <div className="vendor-stack">
                            {data.concentration.flags.length === 0 ? (
                                <p className="vendor-card__meta">{t('dependencies.concentration.no_flags')}</p>
                            ) : (
                                data.concentration.flags.map((flag) => (
                                    <div key={flag.key} className="vendor-card">
                                        <p className="vendor-card__meta">{flag.reason}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="vendor-metric-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                        <div className="vendor-metric">
                            <span className="vendor-metric__label">{t('dependencies.metrics.third_party')}</span>
                            <span className="vendor-metric__value">{data.relationship_tree?.children?.length || 0}</span>
                        </div>
                        <div className="vendor-metric">
                            <span className="vendor-metric__label">{t('dependencies.metrics.fourth_party')}</span>
                            <span className="vendor-metric__value">
                                {data.relationship_tree?.children?.reduce((acc, child) => acc + (child.children?.length || 0), 0) || 0}
                            </span>
                        </div>
                        <div className="vendor-metric">
                            <span className="vendor-metric__label">{t('dependencies.metrics.downstream_services')}</span>
                            <span className="vendor-metric__value">{data.services.length}</span>
                        </div>
                    </div>

                    <div className="vendor-summary-grid">
                        <div className="vendor-stack vendor-stack--lg">
                            <div className="vendor-card space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="vendor-section-title">{t('dependencies.relationships.title')}</h3>
                                        <p className="vendor-section-description">{t('dependencies.subtitle')}</p>
                                    </div>
                                    <Network className="h-4 w-4 vendor-muted" />
                                </div>

                                {canEdit ? (
                                    <div className="vendor-card space-y-3">
                                        <div className="vendor-field-grid">
                                            <div className="vendor-field">
                                                <label className="vendor-label">{t('dependencies.relationships.select_vendor')}</label>
                                                <ThemedSelect
                                                    value={newRelatedId}
                                                    onValueChange={setNewRelatedId}
                                                    options={vendorOptions}
                                                    placeholder={t('dependencies.relationships.select_vendor')}
                                                />
                                            </div>
                                            <div className="vendor-field">
                                                <label className="vendor-label">{t('common:labels.type')}</label>
                                                <ThemedSelect
                                                    value={newRelType}
                                                    onValueChange={(value) => setNewRelType(value as VendorRelationshipType)}
                                                    options={[
                                                        {
                                                            value: 'subcontractor',
                                                            label: t('dependencies.relationships.type.subcontractor'),
                                                        },
                                                        {
                                                            value: 'reseller',
                                                            label: t('dependencies.relationships.type.reseller'),
                                                        },
                                                        {
                                                            value: 'parent_company',
                                                            label: t('dependencies.relationships.type.parent_company'),
                                                        },
                                                        { value: 'other', label: t('dependencies.relationships.type.other') },
                                                    ]}
                                                    placeholder={t('common:labels.type')}
                                                />
                                            </div>
                                        </div>
                                        <VendorActionButton
                                            onClick={addRelationship}
                                            disabled={!newRelatedId || isSaving}
                                            variant="primary"
                                        >
                                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                            {t('dependencies.relationships.actions.add')}
                                        </VendorActionButton>
                                    </div>
                                ) : null}

                                {data.relationships.length === 0 ? (
                                    <VendorEmptyState
                                        icon={<Network className="h-8 w-8" />}
                                        title={t('dependencies.relationships.empty')}
                                    />
                                ) : (
                                    <div className="vendor-stack">
                                        {data.relationships.map((relationship) => (
                                            <div key={relationship.id} className="vendor-card">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="vendor-card__title">
                                                            {relationship.related_vendor_name ?? t('common:fallbacks.unknown_vendor')}
                                                        </p>
                                                        <p className="vendor-card__meta">{relationship.relationship_type}</p>
                                                    </div>
                                                    {canEdit ? (
                                                        <VendorActionButton
                                                            onClick={() =>
                                                                setPendingDelete({
                                                                    kind: 'relationship',
                                                                    id: relationship.id,
                                                                })
                                                            }
                                                            variant="ghost"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </VendorActionButton>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="vendor-card space-y-4">
                                <div>
                                    <h3 className="vendor-section-title">{t('dependencies.graph.title')}</h3>
                                    <p className="vendor-section-description">{t('dependencies.relationships.title')}</p>
                                </div>
                                <VendorDependencyGraph root={data.relationship_tree} />
                            </div>
                        </div>

                        <div className="vendor-card space-y-4">
                            <div>
                                <h3 className="vendor-section-title">{t('dependencies.services.title')}</h3>
                                <p className="vendor-section-description">{t('dependencies.subtitle')}</p>
                            </div>

                            {canEdit ? (
                                <div className="vendor-card space-y-3">
                                    <div className="vendor-field">
                                        <label className="vendor-label">{t('dependencies.services.service_placeholder')}</label>
                                        <input
                                            value={newServiceName}
                                            onChange={(event) => setNewServiceName(event.target.value)}
                                            className="vendor-input"
                                            placeholder={t('dependencies.services.service_placeholder')}
                                        />
                                    </div>
                                    <VendorActionButton
                                        onClick={addService}
                                        disabled={!newServiceName.trim() || isSaving}
                                    >
                                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        {t('dependencies.services.actions.add_service')}
                                    </VendorActionButton>
                                </div>
                            ) : null}

                            {data.services.length === 0 ? (
                                <VendorEmptyState
                                    icon={<Network className="h-8 w-8" />}
                                    title={t('dependencies.services.empty')}
                                />
                            ) : (
                                <div className="vendor-stack">
                                    {data.services.map((service) => (
                                        <div key={service.id} className="vendor-card space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="vendor-card__title">{service.service_name}</p>
                                                    {service.notes ? (
                                                        <p className="vendor-card__meta">{service.notes}</p>
                                                    ) : null}
                                                </div>
                                                {canEdit ? (
                                                    <div className="vendor-toolbar">
                                                        <VendorActionButton
                                                            onClick={() => setAddDependencyServiceId(service.id)}
                                                            variant="primary"
                                                        >
                                                            <Plus className="h-4 w-4" />
                                                            {t('dependencies.services.actions.add_dependency')}
                                                        </VendorActionButton>
                                                        <VendorActionButton
                                                            onClick={() =>
                                                                setPendingDelete({ kind: 'service', id: service.id })
                                                            }
                                                            variant="ghost"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </VendorActionButton>
                                                    </div>
                                                ) : null}
                                            </div>

                                            {service.dependencies.length === 0 ? (
                                                <p className="vendor-card__meta">
                                                    {t('dependencies.services.no_dependencies')}
                                                </p>
                                            ) : (
                                                <div className="vendor-stack">
                                                    {service.dependencies.map((dependency) => (
                                                        <div key={dependency.id} className="vendor-card">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <p className="vendor-card__title">
                                                                        {dependency.supported_function_name ??
                                                                            t('common:fallbacks.not_available')}
                                                                    </p>
                                                                    <p className="vendor-card__meta">
                                                                        {dependency.department_name ??
                                                                            t('common:fallbacks.not_available')}
                                                                        {dependency.risk_name ? ` · ${dependency.risk_name}` : ''}
                                                                    </p>
                                                                </div>
                                                                {canEdit ? (
                                                                    <VendorActionButton
                                                                        onClick={() =>
                                                                            setPendingDelete({
                                                                                kind: 'dependency',
                                                                                id: dependency.id,
                                                                            })
                                                                        }
                                                                        variant="ghost"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </VendorActionButton>
                                                                ) : null}
                                                            </div>
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

            <ConfirmDialog
                isOpen={addDependencyServiceId !== null}
                onClose={() => setAddDependencyServiceId(null)}
                onConfirm={addDependency}
                title={t('dependencies.add_dependency_dialog.title')}
                message={t('dependencies.add_dependency_dialog.message')}
                confirmLabel={t('dependencies.services.actions.add_dependency')}
                variant="info"
                isLoading={isSaving}
                showInput
                inputLabel={t('dependencies.add_dependency_dialog.input_label')}
                inputPlaceholder={t('dependencies.add_dependency_dialog.input_placeholder')}
                inputRequired
            />
            <ConfirmDialog
                isOpen={pendingDelete !== null}
                onClose={() => setPendingDelete(null)}
                onConfirm={handleConfirmDelete}
                title={t('common:actions.delete')}
                message={t('dependencies.confirm_delete')}
                confirmLabel={t('common:actions.delete')}
                variant="danger"
                isLoading={isSaving}
            />
        </VendorSurface>
    );
}
