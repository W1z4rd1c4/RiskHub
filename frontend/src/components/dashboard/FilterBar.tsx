import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Filter,
    X,
    Building2,
    AlertTriangle,
    CheckCircle,
    Shield,
    RotateCcw
} from 'lucide-react';
import { useDashboardFilters, type RiskLevel } from '../../contexts/DashboardFilterContext';
import { lookupApi } from '../../services/lookupApi';
import { ThemedSelect } from '../ui/ThemedSelect';

interface Department {
    id: number;
    name: string;
}

const RISK_LEVELS: { value: RiskLevel; label: string; color: string }[] = [
    { value: 'all', label: 'All', color: 'bg-white/10' },
    { value: 'critical', label: 'Critical', color: 'bg-rose-500/20 text-rose-400' },
    { value: 'high', label: 'High', color: 'bg-orange-500/20 text-orange-400' },
    { value: 'medium', label: 'Medium', color: 'bg-amber-500/20 text-amber-400' },
    { value: 'low', label: 'Low', color: 'bg-emerald-500/20 text-emerald-400' },
];

const CONTROL_STATUSES = [
    { value: null, label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'pending', label: 'Pending' },
    { value: 'deprecated', label: 'Deprecated' },
];

const CONTROL_FORMS = [
    { value: null, label: 'All Forms' },
    { value: 'preventive', label: 'Preventive' },
    { value: 'detective', label: 'Detective' },
    { value: 'corrective', label: 'Corrective' },
];

export function FilterBar() {
    const {
        filters,
        setDepartmentId,
        setRiskLevel,
        setControlStatus,
        setControlForm,
        resetFilters,
        hasActiveFilters,
    } = useDashboardFilters();

    const [departments, setDepartments] = useState<Department[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        lookupApi.getDepartments().then(setDepartments).catch(console.error);
    }, []);

    const activeFilterChips = [
        filters.departmentId && {
            key: 'dept',
            label: departments.find(d => d.id === filters.departmentId)?.name ?? 'Department',
            onRemove: () => setDepartmentId(null),
        },
        filters.riskLevel !== 'all' && {
            key: 'risk',
            label: `Risk: ${filters.riskLevel}`,
            onRemove: () => setRiskLevel('all'),
        },
        filters.controlStatus && {
            key: 'status',
            label: `Status: ${filters.controlStatus}`,
            onRemove: () => setControlStatus(null),
        },
        filters.controlForm && {
            key: 'form',
            label: `Form: ${filters.controlForm}`,
            onRemove: () => setControlForm(null),
        },
    ].filter(Boolean) as { key: string; label: string; onRemove: () => void }[];

    return (
        <div className="glass-card !p-4 mb-6">
            {/* Header Row */}
            <div className="flex items-center justify-between gap-4">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                >
                    <Filter className="h-4 w-4" />
                    <span>Filters</span>
                    {hasActiveFilters && (
                        <span className="ml-1 w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center">
                            {activeFilterChips.length}
                        </span>
                    )}
                </button>

                {/* Active Filter Chips */}
                <div className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                    <AnimatePresence mode="popLayout">
                        {activeFilterChips.map(chip => (
                            <motion.div
                                key={chip.key}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="flex items-center gap-1 px-3 py-1 bg-accent/20 text-accent text-xs font-bold rounded-full whitespace-nowrap"
                            >
                                {chip.label}
                                <button
                                    onClick={chip.onRemove}
                                    className="ml-1 hover:bg-accent/30 rounded-full p-0.5 transition-colors"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {hasActiveFilters && (
                    <button
                        onClick={resetFilters}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                    >
                        <RotateCcw className="h-3 w-3" />
                        Clear All
                    </button>
                )}
            </div>

            {/* Expanded Filter Panel */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 mt-4 border-t border-white/5">
                            {/* Department Dropdown */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <Building2 className="h-3 w-3" />
                                    Department
                                </label>
                                <ThemedSelect
                                    value={filters.departmentId?.toString() ?? ''}
                                    onValueChange={(v) => setDepartmentId(v ? Number(v) : null)}
                                    placeholder="All Departments"
                                    allowEmpty
                                    emptyLabel="All Departments"
                                    options={departments.map(dept => ({ value: dept.id.toString(), label: dept.name }))}
                                />
                            </div>

                            {/* Risk Level Toggle */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <AlertTriangle className="h-3 w-3" />
                                    Risk Level
                                </label>
                                <div className="flex flex-wrap gap-1">
                                    {RISK_LEVELS.map(level => (
                                        <button
                                            key={level.value}
                                            onClick={() => setRiskLevel(level.value)}
                                            className={`px-2 py-1 text-xs font-bold rounded-md transition-all
                                                ${filters.riskLevel === level.value
                                                    ? `${level.color} ring-1 ring-white/20`
                                                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                                }`}
                                        >
                                            {level.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Control Status Dropdown */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <CheckCircle className="h-3 w-3" />
                                    Control Status
                                </label>
                                <ThemedSelect
                                    value={filters.controlStatus ?? ''}
                                    onValueChange={(v) => setControlStatus(v || null)}
                                    placeholder="All Statuses"
                                    allowEmpty
                                    emptyLabel="All Statuses"
                                    options={CONTROL_STATUSES.filter(s => s.value !== null).map(status => ({ value: status.value!, label: status.label }))}
                                />
                            </div>

                            {/* Control Form Dropdown */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <Shield className="h-3 w-3" />
                                    Control Form
                                </label>
                                <ThemedSelect
                                    value={filters.controlForm ?? ''}
                                    onValueChange={(v) => setControlForm(v || null)}
                                    placeholder="All Forms"
                                    allowEmpty
                                    emptyLabel="All Forms"
                                    options={CONTROL_FORMS.filter(f => f.value !== null).map(form => ({ value: form.value!, label: form.label }))}
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
