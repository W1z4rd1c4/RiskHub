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
import { WidgetShell } from '@/components/dashboard/WidgetShell';
import {
    useDashboardFilterMutators,
    useDashboardFilterSelector,
    type RiskLevel,
} from '../../contexts/DashboardFilterContext';
import { lookupApi } from '../../services/lookupApi';
import { ThemedSelect } from '../ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { logError } from '@/services/logger';

interface Department {
    id: number;
    name: string;
}

interface FilterBarProps {
    canUseDepartmentFilter: boolean;
}

export function FilterBar({ canUseDepartmentFilter }: FilterBarProps) {
    const filters = useDashboardFilterSelector(state => state.filters);
    const hasActiveFilters = useDashboardFilterSelector(state => state.hasActiveFilters);
    const {
        setDepartmentId,
        setRiskLevel,
        setControlStatus,
        setControlForm,
        resetFilters,
    } = useDashboardFilterMutators();

    const [departments, setDepartments] = useState<Department[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [departmentLoadError, setDepartmentLoadError] = useState<Error | null>(null);
    const { t } = useTranslation(['dashboard', 'common']);

    const riskLevels: { value: RiskLevel; label: string; color: string }[] = [
        { value: 'all', label: t('common:labels.all'), color: 'bg-white/10' },
        { value: 'critical', label: t('dashboard:risk_levels.critical'), color: 'bg-rose-500/20 text-rose-400' },
        { value: 'high', label: t('dashboard:issues.severity.high'), color: 'bg-orange-500/20 text-orange-400' },
        { value: 'medium', label: t('dashboard:issues.severity.medium'), color: 'bg-amber-500/20 text-amber-400' },
        { value: 'low', label: t('dashboard:issues.severity.low'), color: 'bg-emerald-500/20 text-emerald-400' },
    ];

    const controlStatuses = [
        { value: null, label: t('common:filters.all_statuses') },
        { value: 'active', label: t('dashboard:charts.active') },
        { value: 'inactive', label: t('dashboard:charts.inactive') },
        { value: 'pending', label: t('dashboard:charts.pending') },
        { value: 'deprecated', label: t('dashboard:charts.deprecated') },
    ];

    const controlForms = [
        { value: null, label: t('common:filters.all_forms') },
        { value: 'preventive', label: t('dashboard:charts.preventive') },
        { value: 'detective', label: t('dashboard:charts.detective') },
        { value: 'corrective', label: t('dashboard:charts.corrective') },
    ];

    useEffect(() => {
        lookupApi.getDepartments()
            .then((data) => {
                setDepartments(data);
                setDepartmentLoadError(null);
            })
            .catch((error: unknown) => {
                logError('Failed to load dashboard departments.', error);
                setDepartmentLoadError(
                    error instanceof Error
                        ? error
                        : new Error(t('dashboard:filters.department_load_failed'))
                );
                setDepartments([]);
            });
    }, [t]);

    const activeFilterChips = [
        canUseDepartmentFilter && filters.departmentId && {
            key: 'dept',
            label: departments.find(d => d.id === filters.departmentId)?.name ?? t('dashboard:filters.department'),
            onRemove: () => setDepartmentId(null),
        },
        filters.riskLevel !== 'all' && {
            key: 'risk',
            label: `${t('dashboard:filters.risk_level')}: ${t(`dashboard:issues.severity.${filters.riskLevel}`, filters.riskLevel)}`,
            onRemove: () => setRiskLevel('all'),
        },
        filters.controlStatus && {
            key: 'status',
            label: `${t('common:labels.status')}: ${t(`dashboard:charts.${filters.controlStatus}`, filters.controlStatus)}`,
            onRemove: () => setControlStatus(null),
        },
        filters.controlForm && {
            key: 'form',
            label: `${t('common:labels.form')}: ${t(`dashboard:charts.${filters.controlForm}`, filters.controlForm)}`,
            onRemove: () => setControlForm(null),
        },
    ].filter(Boolean) as { key: string; label: string; onRemove: () => void }[];

    return (
        <WidgetShell title={t('dashboard:filters.title')}>
            <div className="glass-card !p-4 mb-6">
                {/* Header Row */}
                <div className="flex items-center justify-between gap-4">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                    >
                        <Filter className="h-4 w-4" />
                        <span>{t('dashboard:filters.title')}</span>
                        {activeFilterChips.length > 0 && (
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

                    {(hasActiveFilters || activeFilterChips.length > 0) && (
                        <button
                            onClick={resetFilters}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                        >
                            <RotateCcw className="h-3 w-3" />
                            {t('dashboard:filters.clear_all')}
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
                                {canUseDepartmentFilter && (
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            <Building2 className="h-3 w-3" />
                                            {t('dashboard:filters.department')}
                                        </label>
                                        <ThemedSelect
                                            value={filters.departmentId?.toString() ?? ''}
                                            onValueChange={(v) => setDepartmentId(v ? Number(v) : null)}
                                            placeholder={t('common:filters.all_departments')}
                                            allowEmpty
                                            emptyLabel={t('common:filters.all_departments')}
                                            options={departments.map(dept => ({ value: dept.id.toString(), label: dept.name }))}
                                        />
                                        {departmentLoadError && (
                                            <div
                                                data-testid="department-filter-error"
                                                role="status"
                                                className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300"
                                            >
                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                                <span>{t('dashboard:filters.department_load_failed')}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Risk Level Toggle */}
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        <AlertTriangle className="h-3 w-3" />
                                        {t('dashboard:filters.risk_level')}
                                    </label>
                                    <div className="flex flex-wrap gap-1">
                                        {riskLevels.map(level => (
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
                                        {t('dashboard:filters.control_status')}
                                    </label>
                                    <ThemedSelect
                                        value={filters.controlStatus ?? ''}
                                        onValueChange={(v) => setControlStatus(v || null)}
                                        placeholder={t('common:filters.all_statuses')}
                                        allowEmpty
                                        emptyLabel={t('common:filters.all_statuses')}
                                        options={controlStatuses.filter(s => s.value !== null).map(status => ({ value: status.value!, label: status.label }))}
                                    />
                                </div>

                                {/* Control Form Dropdown */}
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        <Shield className="h-3 w-3" />
                                        {t('dashboard:filters.control_form')}
                                    </label>
                                    <ThemedSelect
                                        value={filters.controlForm ?? ''}
                                        onValueChange={(v) => setControlForm(v || null)}
                                        placeholder={t('common:filters.all_forms')}
                                        allowEmpty
                                        emptyLabel={t('common:filters.all_forms')}
                                        options={controlForms.filter(f => f.value !== null).map(form => ({ value: form.value!, label: form.label }))}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </WidgetShell>
    );
}
