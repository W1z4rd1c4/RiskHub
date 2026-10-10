import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { translateCode } from '@/lib/humanizeCode';
import type { ViewMode } from '@/hooks/useActivityLogPageState';
import type { ActivityLogActorLookup } from '@/types/activityLog';
import { useTranslation } from '@/i18n/hooks';

export interface ActivityLogFilterBarProps {
    // Search filter
    search: string;
    onSearchChange: (search: string) => void;

    // Action filter
    action: string;
    onActionChange: (action: string) => void;
    actions: string[];

    // Date filters
    dateFrom: string;
    onDateFromChange: (date: string) => void;
    dateTo: string;
    onDateToChange: (date: string) => void;

    // View mode
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;

    // View mode selectors
    selectedActorId: number | null;
    onActorChange: (id: number | null) => void;
    selectedDepartmentId: number | null;
    onDepartmentChange: (id: number | null) => void;
    selectedRiskId: number | null;
    onRiskChange: (id: number | null) => void;

    // Lookup data for selectors
    actors: ActivityLogActorLookup[];
    departments: { id: number; name: string }[];
    risks: { id: number; name: string }[];
    canFilterByDepartment: boolean;
    canViewEntityFilters: boolean;
}

/**
 * Activity log filter bar component.
 * Renders the view mode selector, entity pickers, and search/date/action filters.
 */
export function ActivityLogFilterBar({
    search,
    onSearchChange,
    action,
    onActionChange,
    actions,
    dateFrom,
    onDateFromChange,
    dateTo,
    onDateToChange,
    viewMode,
    onViewModeChange,
    selectedActorId,
    onActorChange,
    selectedDepartmentId,
    onDepartmentChange,
    selectedRiskId,
    onRiskChange,
    actors,
    departments,
    risks,
    canFilterByDepartment,
    canViewEntityFilters,
}: ActivityLogFilterBarProps) {
    const { t } = useTranslation(['common', 'admin']);
    const viewModes: { id: ViewMode; label: string }[] = [
        { id: 'chronological', label: t('activity_log.view_modes.chronological', { ns: 'admin' }) },
        { id: 'by_person', label: t('activity_log.view_modes.by_person', { ns: 'admin' }) },
        ...(canFilterByDepartment
            ? [{ id: 'by_department' as const, label: t('activity_log.view_modes.by_department', { ns: 'admin' }) }]
            : []),
        { id: 'by_risk', label: t('activity_log.view_modes.by_risk', { ns: 'admin' }) },
    ];

    return (
        <>
            {/* View Mode Selector */}
            <Card padding="compact" className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground">{t('activity_log.view_label', { ns: 'admin' })}</span>
                <div role="group" aria-label={t('activity_log.view_modes_label')} className="flex flex-wrap items-center gap-1">
                    {viewModes.map(mode => (
                        <Button
                            key={mode.id}
                            size="compact"
                            variant={viewMode === mode.id ? 'accent' : 'ghost'}
                            aria-pressed={viewMode === mode.id}
                            onClick={() => onViewModeChange(mode.id)}
                        >
                            {mode.label}
                        </Button>
                    ))}
                </div>

                {/* Conditional pickers based on view mode */}
                {viewMode === 'by_person' && (
                    <ThemedSelect
                        value={selectedActorId?.toString() ?? ''}
                        onValueChange={(v) => onActorChange(v ? Number(v) : null)}
                        placeholder={t('filters.select_person')}
                        triggerAriaLabel={t('filters.select_person')}
                        className="flex-1 min-w-[200px]"
                        options={actors.map(actor => ({ value: actor.id.toString(), label: actor.name }))}
                    />
                )}

                {viewMode === 'by_department' && (
                    <ThemedSelect
                        value={selectedDepartmentId?.toString() ?? ''}
                        onValueChange={(v) => onDepartmentChange(v ? Number(v) : null)}
                        placeholder={t('filters.select_department')}
                        triggerAriaLabel={t('filters.select_department')}
                        className="flex-1 min-w-[200px]"
                        options={departments.map(d => ({ value: d.id.toString(), label: d.name }))}
                    />
                )}

                {viewMode === 'by_risk' && (
                    <ThemedSelect
                        value={selectedRiskId?.toString() ?? ''}
                        onValueChange={(v) => onRiskChange(v ? Number(v) : null)}
                        placeholder={t('filters.select_risk')}
                        triggerAriaLabel={t('filters.select_risk')}
                        className="flex-1 min-w-[200px]"
                        options={risks.map(r => ({ value: r.id.toString(), label: r.name }))}
                    />
                )}
            </Card>

            {/* Filters Section */}
            {canViewEntityFilters ? (
                <Card className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Field label={t('filters.search_logs')} labelVisuallyHidden>
                        {(field) => (
                            <Input
                                {...field}
                                data-testid="activity-log-search-input"
                                type="text"
                                leadingIcon={Search}
                                placeholder={t('filters.search_logs')}
                                value={search}
                                onChange={(e) => onSearchChange(e.target.value)}
                            />
                        )}
                    </Field>

                    <Field label={t('filters.action')} labelVisuallyHidden>
                        {(field) => (
                            <ThemedSelect
                                {...field}
                                value={action}
                                onValueChange={onActionChange}
                                placeholder={t('filters.all_actions')}
                                allowEmpty
                                emptyLabel={t('filters.all_actions')}
                                className="w-full"
                                options={actions.map(act => ({ value: act, label: translateCode(t, 'admin:audit.events', act) }))}
                            />
                        )}
                    </Field>

                    <Field id="activity-log-date-from" label={t('filters.date_from')}>
                        {(field) => (
                            <Input
                                {...field}
                                type="date"
                                value={dateFrom}
                                onChange={(event) => onDateFromChange(event.target.value)}
                            />
                        )}
                    </Field>

                    <Field id="activity-log-date-to" label={t('filters.date_to')}>
                        {(field) => (
                            <Input
                                {...field}
                                type="date"
                                value={dateTo}
                                onChange={(event) => onDateToChange(event.target.value)}
                            />
                        )}
                    </Field>
                </Card>
            ) : null}
        </>
    );
}
