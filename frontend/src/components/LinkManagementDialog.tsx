import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    Search,
    Plus,
    Trash2,
    AlertCircle,
    ChevronDown,
    Link as LinkIcon,
    Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { controlApi } from '@/services/controlApi';
import { riskApi } from '@/services/riskApi';
import { ControlEffectiveness } from '@/types/risk';
import { useAuth } from '@/contexts/AuthContext';

interface LinkManagementDialogProps {
    mode: 'control-to-risk' | 'risk-to-control';
    existingLinks: any[];
    onLink: (targetId: number, effectiveness: ControlEffectiveness, notes?: string) => Promise<void>;
    onUnlink: (targetId: number) => Promise<void>;
    isOpen: boolean;
    onClose: () => void;
}

export function LinkManagementDialog({
    mode,
    existingLinks,
    onLink,
    onUnlink,
    isOpen,
    onClose
}: LinkManagementDialogProps) {
    const { mockUserId } = useAuth();

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Selection state
    const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
    const [effectiveness, setEffectiveness] = useState<ControlEffectiveness>('medium');
    const [notes, setNotes] = useState('');
    const [isLinking, setIsLinking] = useState(false);
    const [isUnlinking, setIsUnlinking] = useState<number | null>(null);

    // Filter out already linked items from results
    const linkedTargetIds = existingLinks.map(link =>
        mode === 'control-to-risk' ? link.risk_id : link.control_id
    );

    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
            setSearchResults([]);
            setSelectedTargetId(null);
            setNotes('');
            return;
        }

        const delayDebounceFn = setTimeout(() => {
            if (searchQuery.trim().length >= 2) {
                handleSearch();
            } else {
                setSearchResults([]);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery, isOpen]);

    const handleSearch = async () => {
        try {
            setIsSearching(true);
            if (mode === 'control-to-risk') {
                const results = await riskApi.getRisks({
                    search: searchQuery,
                    limit: 5,
                    mockUserId
                });
                setSearchResults(results.filter(r => !linkedTargetIds.includes(r.id)));
            } else {
                const results = await controlApi.getControls({
                    search: searchQuery,
                    limit: 5,
                    mockUserId
                });
                setSearchResults(results.filter(c => !linkedTargetIds.includes(c.id)));
            }
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            setIsSearching(false);
        }
    };

    const handleLink = async () => {
        if (selectedTargetId === null) return;
        try {
            setIsLinking(true);
            await onLink(selectedTargetId, effectiveness, notes);
            setSelectedTargetId(null);
            setNotes('');
            setSearchQuery('');
            setSearchResults([]);
        } catch (err) {
            console.error('Linking failed:', err);
        } finally {
            setIsLinking(false);
        }
    };

    const handleUnlink = async (targetId: number) => {
        if (!confirm('Are you sure you want to remove this link?')) return;
        try {
            setIsUnlinking(targetId);
            await onUnlink(targetId);
        } catch (err) {
            console.error('Unlinking failed:', err);
        } finally {
            setIsUnlinking(null);
        }
    };

    const getEffectivenessColor = (eff: string) => {
        switch (eff) {
            case 'high': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'medium': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
            case 'low': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
            default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-2xl max-h-[90vh] glass-card overflow-hidden flex flex-col shadow-2xl border-white/10"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="bg-accent/20 p-2 rounded-lg">
                                    <LinkIcon className="h-5 w-5 text-accent" />
                                </div>
                                <h2 className="text-xl font-black text-white uppercase tracking-tight">
                                    {mode === 'control-to-risk' ? 'Link Risks to Control' : 'Link Controls to Risk'}
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Search and Selection */}
                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Plus className="h-3 w-3" />
                                    Add New Link
                                </h3>

                                <div className="space-y-4">
                                    <div className="relative group">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors" />
                                        <input
                                            type="text"
                                            placeholder={mode === 'control-to-risk' ? "Search risks by code or description..." : "Search controls by name..."}
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none focus:border-accent/50 transition-all placeholder:text-slate-600"
                                        />
                                        {isSearching && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                <Loader2 className="h-4 w-4 text-accent animate-spin" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Search Results Dropdown-like List */}
                                    {searchResults.length > 0 && !selectedTargetId && (
                                        <div className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 animate-in fade-in slide-in-from-top-2 duration-200">
                                            {searchResults.map((result) => (
                                                <button
                                                    key={result.id}
                                                    onClick={() => setSelectedTargetId(result.id)}
                                                    className="w-full flex flex-col items-start px-4 py-3 hover:bg-accent/10 transition-colors text-left"
                                                >
                                                    <span className="text-xs font-bold text-white">
                                                        {mode === 'control-to-risk' ? result.risk_id_code : result.name}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 line-clamp-1">
                                                        {mode === 'control-to-risk' ? result.process : `#CTL-${String(result.id).padStart(4, '0')}`}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Link Configuration Form (shown after selection) */}
                                    <AnimatePresence>
                                        {selectedTargetId && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 space-y-4">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <p className="text-[10px] text-accent font-black uppercase tracking-widest mb-1">Link Configuration</p>
                                                            <p className="text-sm font-bold text-white">
                                                                {mode === 'control-to-risk'
                                                                    ? searchResults.find(r => r.id === selectedTargetId)?.risk_id_code
                                                                    : searchResults.find(r => r.id === selectedTargetId)?.name
                                                                }
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => setSelectedTargetId(null)}
                                                            className="text-xs text-slate-500 hover:text-white transition-colors"
                                                        >
                                                            Change
                                                        </button>
                                                    </div>

                                                    <div className="grid md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Effectiveness</label>
                                                            <div className="relative">
                                                                <select
                                                                    value={effectiveness}
                                                                    onChange={(e) => setEffectiveness(e.target.value as ControlEffectiveness)}
                                                                    className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent/50 appearance-none"
                                                                >
                                                                    <option value="high">High</option>
                                                                    <option value="medium">Medium</option>
                                                                    <option value="low">Low</option>
                                                                </select>
                                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 pointer-events-none" />
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={handleLink}
                                                            disabled={isLinking}
                                                            className="h-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white text-xs font-black uppercase tracking-widest rounded-lg transition-all disabled:opacity-50 mt-auto py-2.5"
                                                        >
                                                            {isLinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <LinkIcon className="h-3 w-3" />}
                                                            Create Link
                                                        </button>
                                                    </div>

                                                    <div>
                                                        <label className="block text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Notes (Optional)</label>
                                                        <textarea
                                                            value={notes}
                                                            onChange={(e) => setNotes(e.target.value)}
                                                            placeholder="Add any context for this linkage..."
                                                            className="w-full bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-accent/50 resize-none h-20"
                                                        />
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </section>

                            {/* Existing Links Table */}
                            <section className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                                    <span>Existing Links</span>
                                    <span className="text-accent">{existingLinks.length}</span>
                                </h3>

                                {existingLinks.length === 0 ? (
                                    <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                                        <AlertCircle className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                                        <p className="text-xs text-slate-600 font-medium tracking-tight">No existing connections found.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {existingLinks.map((link) => (
                                            <div
                                                key={link.id}
                                                className="group p-4 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/[0.05] transition-all"
                                            >
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <span className="text-xs font-bold text-white truncate">
                                                            {mode === 'control-to-risk' ? link.risk?.risk_id_code : link.control?.name}
                                                        </span>
                                                        <span className={cn(
                                                            "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                                                            getEffectivenessColor(link.effectiveness)
                                                        )}>
                                                            {link.effectiveness}
                                                        </span>
                                                    </div>
                                                    {link.notes && (
                                                        <p className="text-[10px] text-slate-500 italic line-clamp-1">"{link.notes}"</p>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => handleUnlink(mode === 'control-to-risk' ? link.risk_id : link.control_id)}
                                                    disabled={isUnlinking === (mode === 'control-to-risk' ? link.risk_id : link.control_id)}
                                                    className="p-2 text-slate-600 hover:text-rose-500 transition-colors rounded-lg hover:bg-rose-500/10"
                                                >
                                                    {isUnlinking === (mode === 'control-to-risk' ? link.risk_id : link.control_id)
                                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                                        : <Trash2 className="h-4 w-4" />
                                                    }
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-white/5 bg-white/[0.02]">
                            <button
                                onClick={onClose}
                                className="w-full text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors py-2"
                            >
                                Close Manager
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
