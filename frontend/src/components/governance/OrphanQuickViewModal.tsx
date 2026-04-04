import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldAlert, ClipboardList, AlertTriangle, User, Loader2, Target, Activity, FileText, Calendar } from 'lucide-react';
import { controlApi } from '@/services/controlApi';
import { riskApi } from '@/services/riskApi';
import type { OrphanedItem } from '@/types/orphanedItem';
import { useTranslation } from '@/i18n/hooks';
import { formatRelativeDateValue } from '@/i18n/formatters';

interface OrphanQuickViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    orphan: OrphanedItem | null;
}

interface ItemDetails {
    description?: string;
    control_form?: string;
    frequency?: string;
    status?: string;
    category?: string;
}

export function OrphanQuickViewModal({ isOpen, onClose, orphan }: OrphanQuickViewModalProps) {
    const { t, i18n } = useTranslation('admin');
    const [itemDetails, setItemDetails] = useState<ItemDetails | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    const orphanItemType = orphan?.item_type;
    const orphanItemId = orphan?.item_id;

    const handleClose = () => {
        setItemDetails(null);
        setIsInitialized(false);
        onClose();
    };

    useEffect(() => {
        if (!isOpen || orphanItemType == null || orphanItemId == null) {
            return;
        }

        let cancelled = false;
        let resetTimeout: ReturnType<typeof setTimeout> | null = null;
        let initTimeout: ReturnType<typeof setTimeout> | null = null;

        resetTimeout = setTimeout(() => {
            if (cancelled) return;
            setItemDetails(null);
            setIsInitialized(false);
        }, 0);

        const fetchDetails = async () => {
            try {
                if (orphanItemType === 'control') {
                    const control = await controlApi.getControl(orphanItemId);
                    if (cancelled) return;
                    setItemDetails(control as ItemDetails);
                } else if (orphanItemType === 'risk') {
                    const risk = await riskApi.getRisk(orphanItemId);
                    if (cancelled) return;
                    setItemDetails(risk as ItemDetails);
                }
                // Small delay for smooth entry
                initTimeout = setTimeout(() => {
                    if (!cancelled) setIsInitialized(true);
                }, 150);
            } catch (err) {
                console.error('Failed to fetch item details:', err);
                initTimeout = setTimeout(() => {
                    if (!cancelled) setIsInitialized(true);
                }, 0);
            }
        };

        void fetchDetails();
        return () => {
            cancelled = true;
            if (resetTimeout) clearTimeout(resetTimeout);
            if (initTimeout) clearTimeout(initTimeout);
        };
    }, [isOpen, orphanItemType, orphanItemId]);

    if (!orphan) return null;

    const typeIcons = {
        risk: ShieldAlert,
        control: ClipboardList,
        kri: AlertTriangle,
    };
    const typeLabels = {
        risk: t('governance.type_risk'),
        control: t('governance.type_control'),
        kri: t('governance.type_kri'),
    };
    const Icon = typeIcons[orphan.item_type as keyof typeof typeIcons] || AlertTriangle;

    const typeColors = {
        risk: 'text-rose-400 bg-rose-500/10',
        control: 'text-accent bg-accent/10',
        kri: 'text-amber-400 bg-amber-500/10',
    };
    const colorClass = typeColors[orphan.item_type as keyof typeof typeColors] || 'text-slate-400 bg-slate-400/10';

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence mode="wait">
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={handleClose}
                    />

                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="relative glass-card w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border-white/5"
                    >
                        {/* Header Section - Same as Resolve Modal */}
                        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                            <div>
                                <h3 className="text-xl font-bold text-white tracking-tight">
                                    {t('governance.quick_view.title')}
                                </h3>
                                <p className="text-xs text-slate-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[300px]">
                                    {orphan.item_name}
                                </p>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 glass rounded-lg text-slate-500 hover:text-white transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            {!isInitialized ? (
                                <div className="py-20 flex flex-col items-center justify-center gap-4">
                                    <Loader2 className="h-10 w-10 text-accent animate-spin" />
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                        {t('governance.quick_view.initializing')}
                                    </p>
                                </div>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="space-y-6"
                                >
                                    {/* Item Detail Summary Bubble - Replicated from Resolve Modal */}
                                    <div className="p-5 rounded-2xl bg-white/5 border border-white/5 flex items-start gap-5">
                                        <div className={`p-3 rounded-xl ${colorClass.split(' ')[1]} border border-white/5 shrink-0`}>
                                            <Icon className={`h-6 w-6 ${colorClass.split(' ')[0]}`} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${colorClass}`}>
                                                    {typeLabels[orphan.item_type as keyof typeof typeLabels] || orphan.item_type}
                                                </span>
                                            </div>
                                            <h4 className="text-lg font-bold text-white mb-3 truncate">
                                                {orphan.item_name}
                                            </h4>
                                            <div className="flex items-center gap-6">
                                                <div className="flex items-center gap-2">
                                                    <User className="h-3.5 w-3.5 text-slate-500" />
                                                    <span className="text-xs text-slate-400 font-medium">{orphan.previous_owner_name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-3.5 w-3.5 text-slate-500" />
                                                    <span className="text-xs text-slate-400 font-medium">
                                                        {formatRelativeDateValue(orphan.orphaned_at, i18n.language)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Detailed Description Panel */}
                                    <div className="space-y-3">
                                        <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                            <FileText className="h-3.5 w-3.5" />
                                            {t('governance.quick_view.business_analysis')}
                                        </h5>
                                        <div className="p-5 rounded-2xl bg-white/5 border border-white/5 bg-black/20">
                                            <p className="text-sm text-slate-300 leading-relaxed font-medium">
                                                {itemDetails?.description || orphan.item_name}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Metadata Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {orphan.item_type === 'control' && itemDetails && (
                                            <>
                                                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Activity className="h-3.5 w-3.5 text-accent" />
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                            {t('governance.quick_view.methodology')}
                                                        </p>
                                                    </div>
                                                    <p className="text-sm font-bold text-white capitalize">
                                                        {itemDetails.control_form || t('governance.quick_view.defaults.manual')}
                                                    </p>
                                                </div>
                                                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Target className="h-3.5 w-3.5 text-accent" />
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                            {t('governance.quick_view.frequency')}
                                                        </p>
                                                    </div>
                                                    <p className="text-sm font-bold text-white capitalize">
                                                        {itemDetails.frequency || t('governance.quick_view.defaults.periodic')}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                        {orphan.item_type === 'risk' && itemDetails && (
                                            <>
                                                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Activity className="h-3.5 w-3.5 text-rose-400" />
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                            {t('governance.quick_view.rating')}
                                                        </p>
                                                    </div>
                                                    <p className="text-sm font-bold text-white capitalize">
                                                        {itemDetails.status || t('governance.quick_view.defaults.active')}
                                                    </p>
                                                </div>
                                                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Target className="h-3.5 w-3.5 text-rose-400" />
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                            {t('governance.quick_view.category')}
                                                        </p>
                                                    </div>
                                                    <p className="text-sm font-bold text-white truncate">
                                                        {itemDetails.category || t('governance.quick_view.defaults.strategic')}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        {/* Footer Section */}
                        <div className="p-6 border-t border-white/5 bg-white/5 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                                {t('governance.quick_view.audit_view')}
                            </span>
                            <button
                                onClick={handleClose}
                                className="px-6 py-2.5 text-xs font-black uppercase tracking-widest text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/10 active:scale-95 shadow-sm"
                            >
                                {t('governance.quick_view.close_preview')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
