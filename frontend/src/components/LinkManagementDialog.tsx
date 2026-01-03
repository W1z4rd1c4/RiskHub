import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
import { lookupApi } from '@/services/lookupApi';
import { ControlEffectiveness } from '@/types/risk';
import { Filter, RotateCcw } from 'lucide-react';

// Link item types for control-to-risk or risk-to-control mode
// Made generic to accept RiskControlLink or ControlRiskLink
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface LinkItem {
    id: number;
    risk_id?: number;
    control_id?: number;
    effectiveness: string;
    notes?: string;
    risk?: Record<string, unknown>;
    control?: Record<string, unknown>;
}

// Search result types
interface SearchResult {
    id: number;
    name?: string;
    description?: string;
    process?: string;
    risk_level?: number;
    frequency?: string;
    department?: { name?: string };
    department_name?: string;
    control_owner_name?: string;
}

// Department lookup type
interface DepartmentLookup {
    id: number;
    name: string;
    code?: string;
}

interface LinkManagementDialogProps {
    mode: 'control-to-risk' | 'risk-to-control';
    existingLinks: LinkItem[];
    onLink: (targetId: number, effectiveness: ControlEffectiveness, notes?: string) => Promise<void>;
    onUnlink: (targetId: number) => Promise<void>;
    isOpen: boolean;
    onClose: () => void;
    showSearch?: boolean;
    showLinks?: boolean;
}

export function LinkManagementDialog({
    mode,
    existingLinks,
    onLink,
    onUnlink,
    isOpen,
    onClose,
    showSearch = true,
    showLinks = true
}: LinkManagementDialogProps) {
    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Selection state
    const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
    const [isLinking, setIsLinking] = useState(false);
    const [isUnlinking, setIsUnlinking] = useState<number | null>(null);

    // Filter state
    const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
    const [selectedProcess, setSelectedProcess] = useState<string>('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');

    // Lookups state
    const [departments, setDepartments] = useState<DepartmentLookup[]>([]);
    const [processes, setProcesses] = useState<string[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [isLoadingLookups, setIsLoadingLookups] = useState(false);

    // Filter out already linked items from results
    const linkedTargetIds = existingLinks.map(link =>
        mode === 'control-to-risk' ? link.risk_id : link.control_id
    );

    useEffect(() => {
        if (isOpen && showSearch) {
            const loadLookups = async () => {
                try {
                    setIsLoadingLookups(true);
                    const [deptData, filterData] = await Promise.all([
                        lookupApi.getDepartments(),
                        lookupApi.getRiskFilters()
                    ]);
                    setDepartments(deptData);
                    setProcesses(filterData.processes);
                    setCategories(filterData.categories);
                } catch (err) {
                    console.error('Failed to load search lookups:', err);
                } finally {
                    setIsLoadingLookups(false);
                }
            };
            loadLookups();
        }
    }, [isOpen, showSearch]);

    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
            setSearchResults([]);
            setSelectedTargetId(null);
            setSelectedDeptId(null);
            setSelectedProcess('');
            setSelectedCategory('');
            return;
        }

        const delayDebounceFn = setTimeout(() => {
            handleSearch();
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery, selectedDeptId, selectedProcess, selectedCategory, isOpen]);

    const handleSearch = async () => {
        try {
            setIsSearching(true);
            const params: Record<string, string | number> = {
                limit: 20 // Show more results since we have filters
            };
            if (searchQuery) params.search = searchQuery;
            if (selectedDeptId) params.department_id = selectedDeptId;
            if (selectedProcess) params.process = selectedProcess;
            if (selectedCategory) params.category = selectedCategory;

            if (mode === 'control-to-risk') {
                const results = await riskApi.getRisks(params);
                setSearchResults(results.items.filter(r => !linkedTargetIds.includes(r.id)));
            } else {
                const results = await controlApi.getControls(params);
                setSearchResults(results.items.filter(c => !linkedTargetIds.includes(c.id)));
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
            await onLink(selectedTargetId, 'medium', '');
            onClose();
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

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
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
                        className="relative w-full max-w-2xl max-h-[90vh] bg-slate-900/95 backdrop-blur-xl rounded-2xl overflow-hidden flex flex-col shadow-2xl border border-white/10"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="bg-accent/20 p-2 rounded-lg">
                                    <LinkIcon className="h-5 w-5 text-accent" />
                                </div>
                                <h2 className="text-xl font-black text-white uppercase tracking-tight">
                                    {!showSearch ? 'Manage existing connections' : (mode === 'control-to-risk' ? 'Link Risks to Control' : 'Link Controls to Risk')}
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
                            {showSearch && (
                                <section className="space-y-4">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Plus className="h-3 w-3" />
                                        Add New Link
                                    </h3>

                                    <div className="space-y-4">
                                        <div className="relative group">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                            <input
                                                type="text"
                                                placeholder={`Search ${mode === 'control-to-risk' ? 'risks' : 'controls'} by name...`}
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium"
                                            />
                                            {isSearching && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    <Loader2 className="h-4 w-4 text-accent animate-spin" />
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            <Filter className="h-3 w-3" />
                                            Filters
                                            {isLoadingLookups && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                                        </div>

                                        {/* Advanced Filters */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div className="relative">
                                                <select
                                                    value={selectedDeptId || ''}
                                                    onChange={(e) => setSelectedDeptId(e.target.value ? Number(e.target.value) : null)}
                                                    className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl py-2 pl-3 pr-8 text-xs text-slate-300 focus:outline-none focus:border-accent/50 transition-all cursor-pointer hover:bg-white/10"
                                                >
                                                    <option value="">All Departments</option>
                                                    {departments.map(d => (
                                                        <option key={d.id} value={d.id}>{d.name}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 pointer-events-none" />
                                            </div>

                                            <div className="relative">
                                                <select
                                                    value={selectedProcess}
                                                    onChange={(e) => setSelectedProcess(e.target.value)}
                                                    className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl py-2 pl-3 pr-8 text-xs text-slate-300 focus:outline-none focus:border-accent/50 transition-all cursor-pointer hover:bg-white/10"
                                                >
                                                    <option value="">All Processes</option>
                                                    {processes.map(p => (
                                                        <option key={p} value={p}>{p}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 pointer-events-none" />
                                            </div>

                                            <div className="relative">
                                                <select
                                                    value={selectedCategory}
                                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                                    className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl py-2 pl-3 pr-8 text-xs text-slate-300 focus:outline-none focus:border-accent/50 transition-all cursor-pointer hover:bg-white/10"
                                                >
                                                    <option value="">All Categories</option>
                                                    {categories.map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 pointer-events-none" />
                                            </div>
                                        </div>

                                        {(selectedDeptId || selectedProcess || selectedCategory) && (
                                            <button
                                                onClick={() => {
                                                    setSelectedDeptId(null);
                                                    setSelectedProcess('');
                                                    setSelectedCategory('');
                                                }}
                                                className="flex items-center gap-2 text-[10px] text-slate-500 hover:text-accent transition-colors mt-1 ml-1 self-start group"
                                            >
                                                <RotateCcw className="h-3 w-3 group-hover:rotate-[-45deg] transition-transform" />
                                                Clear All Filters
                                            </button>
                                        )}

                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between px-1">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    {searchQuery ? 'Search Results' : 'Initial Suggestions'}
                                                </span>
                                                <span className="text-[10px] text-slate-600 font-medium">
                                                    {searchResults.length} {searchResults.length === 1 ? 'item' : 'items'}
                                                </span>
                                            </div>

                                            {searchResults.length > 0 && !selectedTargetId && (
                                                <div className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    {searchResults.map((result) => (
                                                        <button
                                                            key={result.id}
                                                            onClick={() => setSelectedTargetId(result.id)}
                                                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/10 transition-colors text-left group"
                                                        >
                                                            <div className="flex flex-col flex-1 min-w-0 pr-4">
                                                                <span className="text-xs font-bold text-white truncate group-hover:text-accent transition-colors text-balance">
                                                                    {mode === 'control-to-risk' ? result.description : result.name}
                                                                </span>
                                                                <span className="text-[10px] text-slate-500 mt-0.5">
                                                                    {mode === 'control-to-risk' ? result.process : (
                                                                        <span className="flex items-center gap-1">
                                                                            {result.department?.name}
                                                                            {result.control_owner_name && (
                                                                                <>
                                                                                    <span className="text-slate-700 mx-1">/</span>
                                                                                    <span className="text-slate-400 font-medium italic">{result.control_owner_name}</span>
                                                                                </>
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-3 shrink-0">
                                                                {mode === 'risk-to-control' && (
                                                                    <>
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Level</span>
                                                                            <span className="text-[10px] font-bold text-white">{result.risk_level}/5</span>
                                                                        </div>
                                                                        <div className="flex flex-col items-end min-w-[60px]">
                                                                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest text-right">Freq</span>
                                                                            <span className="text-[10px] font-bold text-white capitalize">{result.frequency}</span>
                                                                        </div>
                                                                    </>
                                                                )}
                                                                <div className="p-1.5 rounded-lg bg-white/5 group-hover:bg-accent/20 transition-colors">
                                                                    <Plus className="h-3 w-3 text-slate-500 group-hover:text-accent" />
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {searchResults.length === 0 && !isSearching && !isLoadingLookups && !selectedTargetId && (
                                                <div className="py-12 flex flex-col items-center justify-center bg-slate-900/30 border border-dashed border-white/5 rounded-2xl">
                                                    <div className="p-4 rounded-full bg-white/5 mb-4">
                                                        <Search className="h-6 w-6 text-slate-600" />
                                                    </div>
                                                    <p className="text-sm font-bold text-slate-400">No {mode === 'control-to-risk' ? 'risks' : 'controls'} found</p>
                                                    <p className="text-xs text-slate-600 mt-1">Try adjusting your filters or search query</p>
                                                </div>
                                            )}
                                        </div>

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
                                                            <div className="flex-1 pr-4">
                                                                <p className="text-[10px] text-accent font-black uppercase tracking-widest mb-1">Confirm Linkage</p>
                                                                <p className="text-sm font-bold text-white leading-tight">
                                                                    {mode === 'control-to-risk'
                                                                        ? searchResults.find(r => r.id === selectedTargetId)?.description
                                                                        : searchResults.find(r => r.id === selectedTargetId)?.name
                                                                    }
                                                                </p>
                                                            </div>
                                                            <button
                                                                onClick={() => setSelectedTargetId(null)}
                                                                className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors border border-white/10 rounded-md px-2 py-1"
                                                            >
                                                                Change
                                                            </button>
                                                        </div>

                                                        <div className="flex gap-4">
                                                            <div className="flex-1">
                                                                {mode === 'risk-to-control' && (
                                                                    <div className="bg-slate-900/50 border border-white/5 rounded-xl p-3">
                                                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                                                            Owner Information
                                                                        </p>
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-xs font-bold text-white">
                                                                                {searchResults.find(r => r.id === selectedTargetId)?.control_owner_name || 'No owner assigned'}
                                                                            </span>
                                                                            <span className="text-[10px] text-slate-500">
                                                                                {searchResults.find(r => r.id === selectedTargetId)?.department_name}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={handleLink}
                                                                disabled={isLinking}
                                                                className="px-6 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-lg shadow-accent/20 disabled:opacity-50 h-10 self-end"
                                                            >
                                                                {isLinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <LinkIcon className="h-3 w-3" />}
                                                                Create Link
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </section>
                            )}

                            {/* Existing Links Table */}
                            {showLinks && (
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
                                                                {mode === 'control-to-risk' ? (String(link.risk?.description || 'Unknown Risk')) : String(link.control?.name || 'Unknown Control')}
                                                            </span>
                                                            <span className={cn(
                                                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border font-mono",
                                                                getEffectivenessColor(link.effectiveness)
                                                            )}>
                                                                {link.effectiveness}
                                                            </span>
                                                        </div>
                                                        {link.notes && (
                                                            <p className="text-[10px] text-slate-400 italic line-clamp-1">"{link.notes}"</p>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleUnlink(Number(mode === 'control-to-risk' ? link.risk_id : link.control_id))}
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
                            )}
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
        </AnimatePresence>,
        document.body
    );
}
