/**
 * LinkSearchPanel - Search and filter UI for linking risks/controls
 * Extracted from LinkManagementDialog to improve maintainability.
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    Plus,
    Filter,
    RotateCcw,
    Loader2,
    Link as LinkIcon,
} from 'lucide-react';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Department lookup for filter dropdowns */
export interface DepartmentLookup {
    id: number;
    name: string;
    code?: string;
}

/** Search result item - explicit subset of fields used for display */
export interface SearchResultItem {
    id: number;
    name?: string;
    description?: string;
    process?: string;
    category?: string;
    status?: string;
    risk_level?: number;
    frequency?: string;
    department?: { name?: string };
    department_name?: string;
    control_owner_name?: string;
}

export interface LinkSearchPanelProps {
    mode: 'control-to-risk' | 'risk-to-control' | 'vendor-to-kri';

    // Search state (owned by parent)
    searchQuery: string;
    onSearchQueryChange: (query: string) => void;
    searchResults: SearchResultItem[];
    isSearching: boolean;

    // Filter state (owned by parent)
    selectedDeptId: number | null;
    onDeptIdChange: (id: number | null) => void;
    selectedProcess: string;
    onProcessChange: (process: string) => void;
    selectedCategory: string;
    onCategoryChange: (category: string) => void;
    includeArchived: boolean;
    onIncludeArchivedChange: (include: boolean) => void;

    // Lookups
    departments: DepartmentLookup[];
    processes: string[];
    categories: string[];
    isLoadingLookups: boolean;

    // Selection & linking
    selectedTargetId: number | null;
    onSelectTarget: (id: number | null) => void;
    onLink: () => void;
    isLinking: boolean;
    canUnarchive: boolean;
    onUnarchive: (id: number) => Promise<void>;
}

export function LinkSearchPanel({
    mode,
    searchQuery,
    onSearchQueryChange,
    searchResults,
    isSearching,
    selectedDeptId,
    onDeptIdChange,
    selectedProcess,
    onProcessChange,
    selectedCategory,
    onCategoryChange,
    includeArchived,
    onIncludeArchivedChange,
    departments,
    processes,
    categories,
    isLoadingLookups,
    selectedTargetId,
    onSelectTarget,
    onLink,
    isLinking,
    canUnarchive,
    onUnarchive,
}: LinkSearchPanelProps) {
    const { t } = useTranslation(['common', 'controls', 'kris', 'risks']);
    const hasActiveFilters = selectedDeptId || selectedProcess || selectedCategory || includeArchived;

    const clearAllFilters = () => {
        onDeptIdChange(null);
        onProcessChange('');
        onCategoryChange('');
        onIncludeArchivedChange(false);
    };

    const selectedResult = searchResults.find(r => r.id === selectedTargetId);
    const listHeading = searchQuery ? t('linking.search_results') : t('linking.initial_suggestions');
    const resultCountLabel = searchResults.length === 1
        ? t('linking.result_singular')
        : t('linking.result_plural');

    return (
        <section className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Plus className="h-3 w-3" />
                {mode === 'control-to-risk'
                    ? `${t('common:actions.create')} ${t('controls:actions.link_risk')}`
                    : mode === 'risk-to-control'
                        ? `${t('common:actions.create')} ${t('risks:actions.link_control')}`
                        : t('vendors:links.actions.link_existing')}
            </h3>

            <div className="space-y-4">
                {/* Search Input */}
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder={
                            mode === 'control-to-risk'
                                ? t('filters.search_risks')
                                : mode === 'risk-to-control'
                                    ? t('filters.search_controls')
                                    : t('filters.search_kris')
                        }
                        value={searchQuery}
                        onChange={(e) => onSearchQueryChange(e.target.value)}
                        className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all font-medium"
                    />
                    {isSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 text-accent animate-spin" />
                        </div>
                    )}
                </div>

                {/* Filter Header */}
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <Filter className="h-3 w-3" />
                    {t('common:actions.filter')}
                    {isLoadingLookups && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-400 font-semibold">
                    <input
                        type="checkbox"
                        checked={includeArchived}
                        onChange={(e) => onIncludeArchivedChange(e.target.checked)}
                    />
                    {t('filters.include_archived')}
                </label>

                {/* Filter Dropdowns */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <ThemedSelect
                        value={selectedDeptId?.toString() ?? ''}
                        onValueChange={(v) => onDeptIdChange(v ? Number(v) : null)}
                        placeholder={t('filters.all_departments')}
                        allowEmpty
                        emptyLabel={t('filters.all_departments')}
                        options={departments.map(d => ({ value: d.id.toString(), label: d.name }))}
                    />

                    <ThemedSelect
                        value={selectedProcess}
                        onValueChange={onProcessChange}
                        placeholder={t('filters.all_processes')}
                        allowEmpty
                        emptyLabel={t('filters.all_processes')}
                        options={processes.map(p => ({ value: p, label: p }))}
                    />

                    <ThemedSelect
                        value={selectedCategory}
                        onValueChange={onCategoryChange}
                        placeholder={t('filters.all_categories')}
                        allowEmpty
                        emptyLabel={t('filters.all_categories')}
                        options={categories.map(c => ({ value: c, label: c }))}
                    />
                </div>

                {/* Clear Filters Button */}
                {hasActiveFilters && (
                    <button
                        onClick={clearAllFilters}
                        className="flex items-center gap-2 text-[10px] text-slate-500 hover:text-accent transition-colors mt-1 ml-1 self-start group"
                    >
                        <RotateCcw className="h-3 w-3 group-hover:rotate-[-45deg] transition-transform" />
                        {t('common:actions.clear')}
                    </button>
                )}

                {/* Results List */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {listHeading}
                        </span>
                        <span className="text-[10px] text-slate-600 font-medium">
                            {searchResults.length} {resultCountLabel}
                        </span>
                    </div>

                    {searchResults.length > 0 && !selectedTargetId && (
                        <div className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 animate-in fade-in slide-in-from-top-2 duration-200">
                            {searchResults.map((result) => (
                                <button
                                    key={result.id}
                                    onClick={() => onSelectTarget(result.id)}
                                    className={`w-full flex items-center justify-between px-4 py-3 hover:bg-accent/10 transition-colors text-left group ${result.status === 'archived' ? 'opacity-70' : ''}`}
                                >
                                    <div className="flex flex-col flex-1 min-w-0 pr-4">
                                        <span className="text-xs font-bold text-white truncate group-hover:text-accent transition-colors text-balance flex items-center gap-2">
                                            <span>{mode === 'control-to-risk' ? result.description : result.name}</span>
                                            {result.status === 'archived' && (
                                                <span className="px-1 py-0.5 rounded bg-white/10 border border-white/10 text-slate-300 text-[9px] uppercase tracking-widest">
                                                    {t('labels.archived')}
                                                </span>
                                            )}
                                        </span>
                                        <span className="text-[10px] text-slate-500 mt-0.5">
                                            {mode === 'control-to-risk' ? result.process : mode === 'vendor-to-kri' ? (
                                                <span className="flex items-center gap-1">
                                                    {result.process || t('common:fallbacks.not_available')}
                                                    {result.department_name && (
                                                        <>
                                                            <span className="text-slate-700 mx-1">/</span>
                                                            <span className="text-slate-400 font-medium italic">{result.department_name}</span>
                                                        </>
                                                    )}
                                                </span>
                                            ) : (
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
                                        {result.status === 'archived' && canUnarchive && (
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    void onUnarchive(result.id);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        void onUnarchive(result.id);
                                                    }
                                                }}
                                                className="px-2 py-1 rounded-md border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 text-[9px] font-black uppercase tracking-widest"
                                            >
                                                {t('actions.unarchive')}
                                            </span>
                                        )}
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
                            <p className="text-sm font-bold text-slate-400">
                                {mode === 'control-to-risk'
                                    ? t('common:empty.no_risks_found')
                                    : mode === 'risk-to-control'
                                        ? t('common:empty.no_controls_found')
                                        : t('common:empty.no_kris_found')}
                            </p>
                            <p className="text-xs text-slate-600 mt-1">{t('common:linking.try_adjust_filters')}</p>
                        </div>
                    )}
                </div>

                {/* Link Confirmation Panel (shown after selection) */}
                <AnimatePresence>
                    {selectedTargetId && selectedResult && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 space-y-4">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 pr-4">
                                        <p className="text-[10px] text-accent font-black uppercase tracking-widest mb-1">{t('common:linking.confirm_linkage')}</p>
                                        <p className="text-sm font-bold text-white leading-tight">
                                            {mode === 'control-to-risk' ? selectedResult.description : selectedResult.name}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => onSelectTarget(null)}
                                        className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors border border-white/10 rounded-md px-2 py-1"
                                    >
                                        {t('common:linking.change')}
                                    </button>
                                </div>

                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        {mode === 'risk-to-control' && (
                                            <div className="bg-slate-900/50 border border-white/5 rounded-xl p-3">
                                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                                    {t('common:linking.owner_information')}
                                                </p>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-white">
                                                        {selectedResult.control_owner_name || t('common:empty.no_manager')}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500">
                                                        {selectedResult.department_name}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                        {mode === 'vendor-to-kri' && (
                                            <div className="bg-slate-900/50 border border-white/5 rounded-xl p-3">
                                                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                                    {t('kris:fields.linked_risk')}
                                                </p>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-white">
                                                        {selectedResult.process || t('common:fallbacks.not_available')}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500">
                                                        {selectedResult.department_name || t('common:fallbacks.unassigned')}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={onLink}
                                        disabled={isLinking}
                                        className="px-6 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-lg shadow-accent/20 disabled:opacity-50 h-10 self-end"
                                    >
                                        {isLinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <LinkIcon className="h-3 w-3" />}
                                        {t('common:linking.create_link')}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </section>
    );
}
