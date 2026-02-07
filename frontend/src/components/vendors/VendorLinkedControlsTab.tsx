import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { CheckSquare, ExternalLink, Link2, Loader2, Plus } from 'lucide-react';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import type { ExistingLinkItem } from '@/components/linking/ExistingLinksPanel';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { LinkedControl } from '@/types/vendorLink';

interface VendorLinkedControlsTabProps {
    vendorId: number;
    canEdit: boolean;
    onNavigateToControl: (controlId: number) => void;
}

export function VendorLinkedControlsTab({ vendorId, canEdit, onNavigateToControl }: VendorLinkedControlsTabProps) {
    const { t } = useTranslation('vendors');
    const [linkedControls, setLinkedControls] = useState<LinkedControl[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await vendorLinkApi.getLinkedControls(vendorId);
            setLinkedControls(data);
            setError(null);
        } catch (err) {
            console.error('Failed to load linked controls:', err);
            setError(t('errors.load_failed', 'Failed to load vendors'));
        } finally {
            setIsLoading(false);
        }
    }, [t, vendorId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const existingLinks = useMemo<ExistingLinkItem[]>(
        () =>
            linkedControls.map((c) => ({
                id: c.id,
                control_id: c.id,
                effectiveness: 'medium',
                control: { name: c.name },
            })),
        [linkedControls],
    );

    const activeControls = linkedControls.filter((control) => control.status !== 'archived');
    const archivedControls = linkedControls.filter((control) => control.status === 'archived');

    const handleLink = async (controlId: number) => {
        await vendorLinkApi.linkControl(vendorId, controlId);
        await refresh();
    };

    const handleUnlink = async (controlId: number) => {
        await vendorLinkApi.unlinkControl(vendorId, controlId);
        await refresh();
    };

    return (
        <section className="glass-card p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <CheckSquare className="h-4 w-4" />
                        {t('tabs.linked_controls', 'Linked Controls')}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        {t('links.controls.subtitle', 'Assign controls that mitigate vendor exposure.')}
                    </p>
                </div>
                {canEdit && (
                    <button
                        onClick={() => setIsDialogOpen(true)}
                        className="px-4 py-2 bg-accent/20 text-accent border border-accent/30 rounded-xl font-bold hover:bg-accent/30 transition-colors flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        {t('links.actions.manage', 'Manage links')}
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center gap-3 text-slate-500 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading', 'Loading...')}
                </div>
            ) : error ? (
                <div className="text-rose-400 font-medium">{error}</div>
            ) : linkedControls.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                    <Link2 className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-600 font-medium tracking-tight">
                        {t('links.controls.empty', 'No linked controls yet.')}
                    </p>
                </div>
            ) : (
                <div className="space-y-5">
                    {activeControls.length > 0 && (
                        <div className="space-y-3">
                            {activeControls.map((control) => (
                                <button
                                    key={control.id}
                                    onClick={() => onNavigateToControl(control.id)}
                                    className="w-full p-4 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.05] transition-all text-left group"
                                >
                                    <div className="min-w-0 pr-4">
                                        <div className="text-sm font-bold text-white truncate group-hover:text-accent transition-colors">
                                            {control.name}
                                        </div>
                                        <div className="text-[10px] text-slate-500 mt-1 font-medium">
                                            {control.department_name ?? '—'}
                                            {control.status ? (
                                                <>
                                                    <span className="text-slate-700 mx-2">/</span>
                                                    {control.status}
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="p-2 rounded-lg bg-white/5 group-hover:bg-accent/20 transition-colors">
                                        <ExternalLink className="h-4 w-4 text-slate-500 group-hover:text-accent" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                    {archivedControls.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {t('links.archived_controls', 'Archived controls')} ({archivedControls.length})
                            </h4>
                            <div className="space-y-3 opacity-70">
                                {archivedControls.map((control) => (
                                    <button
                                        key={control.id}
                                        onClick={() => onNavigateToControl(control.id)}
                                        className="w-full p-4 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.05] transition-all text-left group"
                                    >
                                        <div className="min-w-0 pr-4">
                                            <div className="text-sm font-bold text-white truncate group-hover:text-accent transition-colors">
                                                {control.name}
                                            </div>
                                            <div className="text-[10px] text-slate-500 mt-1 font-medium">
                                                {control.department_name ?? '—'}
                                                {control.status ? (
                                                    <>
                                                        <span className="text-slate-700 mx-2">/</span>
                                                        {control.status}
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="p-2 rounded-lg bg-white/5 group-hover:bg-accent/20 transition-colors">
                                            <ExternalLink className="h-4 w-4 text-slate-500 group-hover:text-accent" />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {canEdit && (
                <LinkManagementDialog
                    mode="risk-to-control"
                    title={t('links.dialogs.link_controls_title', 'Link Controls to Vendor')}
                    existingLinks={existingLinks}
                    onLink={async (targetId, _effectiveness, _notes) => handleLink(targetId)}
                    onUnlink={async (targetId) => handleUnlink(targetId)}
                    isOpen={isDialogOpen}
                    onClose={() => setIsDialogOpen(false)}
                />
            )}
        </section>
    );
}
