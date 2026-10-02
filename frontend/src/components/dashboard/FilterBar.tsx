import { useEffect, useId, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Filter,
    X,
    Building2,
    AlertTriangle,
    CheckCircle,
    Shield,
    RotateCcw,
    type LucideIcon,
} from 'lucide-react';
import { WidgetShell } from '@/components/dashboard/WidgetShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import {
    useDashboardFilterMutators,
    useDashboardFilterSelector,
    type RiskLevel,
} from '../../contexts/DashboardFilterContext';
import { lookupApi } from '../../services/lookupApi';
import { ThemedSelect } from '../ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { severityClass } from '@/lib/severity';
import { cn } from '@/lib/utils';
import { logError } from '@/services/logger';
import { ControlForm, ControlStatus, isControlForm, isControlStatus } from '@/types/control';
import type { DashboardFilterScope } from '@/types/dashboard';

interface Department {
    id: number;
    name: string;
}

interface FilterBarProps {
    canUseDepartmentFilter: boolean;
    filterScope?: DashboardFilterScope;
}

export function FilterBar({ canUseDepartmentFilter, filterScope }: FilterBarProps) {
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
    const panelId = useId();

    const riskLevels: { value: RiskLevel; label: string; color: string }[] = [
        { value: 'all', label: t('common:labels.all'), color: 'bg-tint/10 text-foreground border-border' },
        { value: 'critical', label: t('dashboard:risk_levels.critical'), color: severityClass('badge', 'critical') },
        { value: 'high', label: t('dashboard:risk_levels.high'), color: severityClass('badge', 'high') },
        { value: 'medium', label: t('dashboard:risk_levels.medium'), color: severityClass('badge', 'medium') },
        { value: 'low', label: t('dashboard:risk_levels.low'), color: severityClass('badge', 'low') },
    ];

    const controlStatuses = [
        { value: null, label: t('common:filters.all_statuses') },
        { value: ControlStatus.DRAFT, label: t('dashboard:charts.draft') },
        { value: ControlStatus.ACTIVE, label: t('dashboard:charts.active') },
        { value: ControlStatus.INACTIVE, label: t('dashboard:charts.inactive') },
    ];

    const controlForms = [
        { value: null, label: t('common:filters.all_forms') },
        { value: ControlForm.MANUAL, label: t('dashboard:charts.manual') },
        { value: ControlForm.AUTOMATIC, label: t('dashboard:charts.automatic') },
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
            label: `${t('dashboard:filters.risk_level')}: ${t(`dashboard:risk_levels.${filters.riskLevel}`, filters.riskLevel)}`,
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
    const hasRiskOrControlFilter = filters.riskLevel !== 'all'
        || filters.controlStatus !== null
        || filters.controlForm !== null;
    const unaffectedPanelLabels = filterScope?.unaffected_by_risk_control
        .map(panel => t(`dashboard:filters.panels.${panel}`))
        .join(', ');

    const fieldLabel = (Icon: LucideIcon, text: string) => (
        <span className="inline-flex items-center gap-2">
            <Icon aria-hidden="true" className="size-3.5 shrink-0 text-icon-muted" />
            {text}
        </span>
    );

    return (
        <WidgetShell title={t('dashboard:filters.title')}>
            <Card padding="compact" className="mb-6">
                {/* Header Row */}
                <div className="flex items-center justify-between gap-4">
                    <Button
                        variant="ghost"
                        size="compact"
                        onClick={() => setIsExpanded(!isExpanded)}
                        aria-expanded={isExpanded}
                        aria-controls={panelId}
                        className="text-sm font-bold text-muted-foreground"
                    >
                        <Filter aria-hidden="true" />
                        <span>{t('dashboard:filters.title')}</span>
                        {activeFilterChips.length > 0 && ' '}
                        {activeFilterChips.length > 0 && (
                            <Badge tone="accent" variant="solid" size="sm" className="ml-1">
                                {activeFilterChips.length}
                            </Badge>
                        )}
                    </Button>

                    {/* Active Filter Chips */}
                    <div className="flex-1 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                        <AnimatePresence mode="popLayout">
                            {activeFilterChips.map(chip => (
                                <motion.div
                                    key={chip.key}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 py-0.5 pl-3 pr-0.5 text-xs font-bold text-accent-text whitespace-nowrap"
                                >
                                    {chip.label}
                                    <Button
                                        variant="ghost"
                                        size="iconCompact"
                                        onClick={chip.onRemove}
                                        aria-label={t('dashboard:filters.remove', { label: chip.label })}
                                        className="size-6 rounded-full text-accent-text hover:bg-accent/20 hover:text-accent-text"
                                    >
                                        <X aria-hidden="true" />
                                    </Button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {(hasActiveFilters || activeFilterChips.length > 0) && (
                        <Button variant="ghost" size="compact" onClick={resetFilters} className="text-muted-foreground">
                            <RotateCcw aria-hidden="true" />
                            {t('dashboard:filters.clear_all')}
                        </Button>
                    )}
                </div>

                {hasRiskOrControlFilter && unaffectedPanelLabels ? (
                    <p className="mt-3 text-xs text-muted-foreground" data-testid="dashboard-filter-scope-note">
                        {t('dashboard:filters.unaffected_scope', { panels: unaffectedPanelLabels })}
                    </p>
                ) : null}

                {/* Expanded Filter Panel */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            id={panelId}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 mt-4 border-t border-border">
                                {canUseDepartmentFilter && (
                                    <div className="space-y-2">
                                        <Field label={fieldLabel(Building2, t('dashboard:filters.department'))}>
                                            {(field) => (
                                                <ThemedSelect
                                                    {...field}
                                                    value={filters.departmentId?.toString() ?? ''}
                                                    onValueChange={(v) => setDepartmentId(v ? Number(v) : null)}
                                                    placeholder={t('common:filters.all_departments')}
                                                    allowEmpty
                                                    emptyLabel={t('common:filters.all_departments')}
                                                    options={departments.map(dept => ({ value: dept.id.toString(), label: dept.name }))}
                                                />
                                            )}
                                        </Field>
                                        {departmentLoadError && (
                                            <InlineMessage
                                                tone="warning"
                                                data-testid="department-filter-error"
                                                className="p-2 text-xs"
                                            >
                                                {t('dashboard:filters.department_load_failed')}
                                            </InlineMessage>
                                        )}
                                    </div>
                                )}

                                {/* Risk Level Toggle (D1 bands, labelled with the risk-level keys) */}
                                <Field group label={fieldLabel(AlertTriangle, t('dashboard:filters.risk_level'))}>
                                    {(field) => (
                                        <div role="group" id={field.id} aria-labelledby={field['aria-labelledby']} className="flex flex-wrap gap-1">
                                            {riskLevels.map(level => {
                                                const isPressed = filters.riskLevel === level.value;
                                                return (
                                                    <Button
                                                        key={level.value}
                                                        variant="ghost"
                                                        size="compact"
                                                        aria-pressed={isPressed}
                                                        onClick={() => setRiskLevel(level.value)}
                                                        className={cn(
                                                            'border font-bold',
                                                            isPressed
                                                                ? level.color
                                                                : 'border-transparent bg-tint/5 text-muted-foreground',
                                                        )}
                                                    >
                                                        {level.label}
                                                    </Button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </Field>

                                {/* Control Status Dropdown */}
                                <Field label={fieldLabel(CheckCircle, t('dashboard:filters.control_status'))}>
                                    {(field) => (
                                        <ThemedSelect
                                            {...field}
                                            value={filters.controlStatus ?? ''}
                                            onValueChange={(v) => setControlStatus(isControlStatus(v) ? v : null)}
                                            placeholder={t('common:filters.all_statuses')}
                                            allowEmpty
                                            emptyLabel={t('common:filters.all_statuses')}
                                            options={controlStatuses.filter(s => s.value !== null).map(status => ({ value: status.value!, label: status.label }))}
                                        />
                                    )}
                                </Field>

                                {/* Control Form Dropdown */}
                                <Field label={fieldLabel(Shield, t('dashboard:filters.control_form'))}>
                                    {(field) => (
                                        <ThemedSelect
                                            {...field}
                                            value={filters.controlForm ?? ''}
                                            onValueChange={(v) => setControlForm(isControlForm(v) ? v : null)}
                                            placeholder={t('common:filters.all_forms')}
                                            allowEmpty
                                            emptyLabel={t('common:filters.all_forms')}
                                            options={controlForms.filter(f => f.value !== null).map(form => ({ value: form.value!, label: form.label }))}
                                        />
                                    )}
                                </Field>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Card>
        </WidgetShell>
    );
}
