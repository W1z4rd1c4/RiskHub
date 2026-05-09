import type { ReactNode } from 'react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Link as LinkIcon, Loader2, Plus } from 'lucide-react';

import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import type { LinkMode } from '@/components/linking/linkTypes';
import { useTranslation } from '@/i18n/hooks';

import {
    useVendorLinkedEntities,
    type VendorLinkedEntitiesAdapter,
} from './useVendorLinkedEntities';

type DialogMode = 'links-only' | 'search-only';

export interface VendorLinkedEntitiesTabProps<T extends { id: number }> {
    vendorId: number;
    adapter: VendorLinkedEntitiesAdapter<T>;
    canCreate: boolean;
    canEdit: boolean;
    onAdd: () => void;
    renderCard: (item: T, onClick: () => void) => ReactNode;
    onNavigate: (entityId: number) => void;
    icon: ReactNode;
    headerColorClass: string;
    i18nKeys: {
        tabTitle: string;
        subtitle: string;
        empty: string;
        archived: string;
        dialogTitle: string;
        addAction: string;
    };
    linkDialogMode: LinkMode;
    dataTestIdPrefix?: string;
    addButtonTestId?: string;
    motionDelay?: number;
}

export function VendorLinkedEntitiesTab<T extends { id: number }>({
    vendorId,
    adapter,
    canCreate,
    canEdit,
    onAdd,
    renderCard,
    onNavigate,
    icon,
    headerColorClass,
    i18nKeys,
    linkDialogMode,
    dataTestIdPrefix,
    addButtonTestId,
    motionDelay = 0,
}: VendorLinkedEntitiesTabProps<T>) {
    const { t } = useTranslation(['vendors', 'common']);
    const entities = useVendorLinkedEntities(vendorId, adapter);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('search-only');
    const testId = (suffix: string) => dataTestIdPrefix ? `${dataTestIdPrefix}-${suffix}` : undefined;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: motionDelay }}
            className="glass-card"
            data-testid={testId('section')}
        >
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6 gap-4">
                <div className="flex items-center gap-3">
                    {icon}
                    <div>
                        <h3 className={`font-bold uppercase tracking-widest text-xs ${headerColorClass}`}>{t(i18nKeys.tabTitle)}</h3>
                        <p className="text-sm text-slate-500 mt-1">{t(i18nKeys.subtitle)}</p>
                    </div>
                </div>
                {canEdit ? (
                    <div className="flex items-stretch bg-accent/10 border border-accent/20 rounded-lg overflow-hidden">
                        <button type="button" onClick={() => { setDialogMode('search-only'); setIsDialogOpen(true); }} data-testid={testId('link-existing')} className="flex items-center gap-2 px-4 py-1.5 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 transition-all border-r border-accent/20">
                            <LinkIcon className="h-3 w-3" />
                            {t('links.actions.link_existing')}
                        </button>
                        {canCreate ? (
                            <button type="button" onClick={onAdd} data-testid={addButtonTestId ?? testId('add')} className="flex items-center gap-2 px-3 py-1.5 text-accent text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 transition-all" title={t(i18nKeys.addAction)}>
                                <Plus className="h-3.5 w-3.5" />
                                <span>{t(i18nKeys.addAction)}</span>
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {entities.isLoading ? (
                <div className="flex items-center gap-3 text-slate-400 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            ) : entities.error ? (
                <div className="mb-2 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-medium">
                    <AlertCircle className="h-5 w-5" />
                    {t(entities.error)}
                </div>
            ) : entities.items.length === 0 ? (
                <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl">
                    <p className="text-xs text-slate-600 font-medium">{t(i18nKeys.empty)}</p>
                </div>
            ) : (
                <>
                    {entities.active.length > 0 ? (
                        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {entities.active.map((item) => renderCard(item, () => onNavigate(item.id)))}
                        </div>
                    ) : null}
                    {entities.archived.length > 0 ? (
                        <div className="mt-8">
                            <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-600" />{t(i18nKeys.archived, { count: entities.archived.length })}</h4>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-50 hover:opacity-100 transition-opacity">
                                {entities.archived.map((item) => renderCard(item, () => onNavigate(item.id)))}
                            </div>
                        </div>
                    ) : null}
                </>
            )}

            {canEdit ? (
                <button type="button" onClick={() => { setDialogMode('links-only'); setIsDialogOpen(true); }} data-testid={testId('manage-existing')} className="w-full mt-6 py-3 border border-dashed border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:border-accent/40 hover:bg-white/5 transition-all">
                    {t('links.actions.manage_existing')}
                </button>
            ) : null}
            {canEdit ? (
                <LinkManagementDialog mode={linkDialogMode} title={t(i18nKeys.dialogTitle)} existingLinks={entities.existingLinks} onLink={async (targetId) => entities.link(targetId)} onUnlink={async (targetId) => entities.unlink(targetId)} isOpen={isDialogOpen} onClose={() => setIsDialogOpen(false)} showSearch={dialogMode !== 'links-only'} showLinks={dialogMode !== 'search-only'} showLinkMetadataBadge={false} />
            ) : null}
        </motion.div>
    );
}
