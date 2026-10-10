import { AlertTriangle, ChevronRight, ClipboardList, Target, type LucideIcon } from 'lucide-react';
import type { NavigateFunction } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TableRowButton, TD, TR } from '@/components/ui/table';
import type { SafeTFunction } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import type { DepartmentMetrics } from '@/types/dashboard';

// Focus-toggle recipes (class lists, not UI copy).
const FOCUS_SELECTED_CLASS = 'text-accent-text bg-accent/10';
const FOCUS_IDLE_CLASS = 'hover:text-chart-2 hover:bg-chart-2/10';

interface DepartmentQuickActionsProps {
    canUseDepartmentFilter: boolean;
    departmentId: number;
    isSelected: boolean;
    navigate: NavigateFunction;
    setDepartmentId: (id: number | null) => void;
    t: SafeTFunction;
}

/**
 * Named icon action (`Button` iconCompact) with a decorative hover/focus
 * tooltip; the accessible name is the `aria-label`, so the tooltip is hidden
 * from assistive technology.
 */
function QuickActionButton({
    icon: Icon,
    label,
    onClick,
    className,
}: {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
    className?: string;
}) {
    return (
        <span className="relative group/tooltip">
            <Button
                variant="ghost"
                size="iconCompact"
                aria-label={label}
                onClick={(event) => {
                    event.stopPropagation();
                    onClick();
                }}
                className={cn('text-muted-foreground', className)}
            >
                <Icon aria-hidden="true" />
            </Button>
            <span
                aria-hidden="true"
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 text-xs font-bold text-popover-foreground bg-popover border border-border rounded shadow-popover opacity-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50"
            >
                {label}
            </span>
        </span>
    );
}

function DepartmentQuickActions({
    canUseDepartmentFilter,
    departmentId,
    isSelected,
    navigate,
    setDepartmentId,
    t,
}: DepartmentQuickActionsProps) {
    const focusLabel = isSelected
        ? t('department_table.actions.remove_focus')
        : t('department_table.actions.set_focus');
    return (
        <div className="flex items-center justify-end gap-1">
            <QuickActionButton
                icon={ClipboardList}
                label={t('department_table.actions.view_controls')}
                onClick={() => void navigate(`/controls?department=${departmentId}`)}
                className="hover:text-accent-text hover:bg-accent/10"
            />
            <QuickActionButton
                icon={AlertTriangle}
                label={t('department_table.actions.view_risks')}
                onClick={() => void navigate(`/risks?department=${departmentId}`)}
                className="hover:text-severity-high-text hover:bg-severity-high/10"
            />
            {canUseDepartmentFilter && (
                <QuickActionButton
                    icon={Target}
                    label={focusLabel}
                    onClick={() => setDepartmentId(isSelected ? null : departmentId)}
                    className={isSelected ? FOCUS_SELECTED_CLASS : FOCUS_IDLE_CLASS}
                />
            )}
            <QuickActionButton
                icon={ChevronRight}
                label={t('department_table.actions.go_to_department')}
                onClick={() => void navigate(`/risks?department=${departmentId}`)}
                className="group-hover:text-foreground"
            />
        </div>
    );
}

export function DepartmentMetricRow({
    canUseDepartmentFilter,
    dept,
    isSelected,
    navigate,
    setDepartmentId,
    t,
}: {
    canUseDepartmentFilter: boolean;
    dept: DepartmentMetrics;
    isSelected: boolean;
    navigate: NavigateFunction;
    setDepartmentId: (id: number | null) => void;
    t: SafeTFunction;
}) {
    const nameClassName = cn(
        'text-sm font-bold transition-colors',
        isSelected ? 'text-accent-text' : 'text-foreground group-hover:text-accent-text',
    );
    return (
        <TR
            className={cn(
                'group',
                isSelected && 'bg-accent/10 border-l-2 border-l-accent',
                dept.breaching_kri_count > 0 && 'border-l-2 border-l-destructive/50',
            )}
        >
            <TD>
                {canUseDepartmentFilter ? (
                    <TableRowButton onClick={() => setDepartmentId(dept.department_id)}>
                        <span className={nameClassName}>{dept.department_name}</span>
                        {isSelected && (
                            <span className="text-eyebrow text-accent-text">
                                {t('department_table.focused')}
                            </span>
                        )}
                    </TableRowButton>
                ) : (
                    <span className={nameClassName}>{dept.department_name}</span>
                )}
            </TD>
            <TD align="center">
                <span className="text-sm font-mono text-foreground">{dept.control_count}</span>
            </TD>
            <TD align="center">
                <div className="flex flex-col items-center">
                    <span className="text-sm font-mono text-foreground">{dept.risk_count}</span>
                    {dept.high_risk_count > 0 && (
                        <span className="text-eyebrow mt-0.5 text-destructive">
                            {dept.high_risk_count} {t('department_table.high')}
                        </span>
                    )}
                </div>
            </TD>
            <TD align="center">
                <div className="flex flex-col items-center">
                    <span className={`text-sm font-mono ${dept.audited_control_count > 0 ? 'text-success-text font-bold' : 'text-muted-foreground'}`}>
                        {dept.audited_control_count}/{dept.control_count}
                    </span>
                    <span className="text-eyebrow mt-0.5">
                        {t('department_table.audited')}
                    </span>
                </div>
            </TD>
            <TD align="center">
                <div className="flex flex-col items-center">
                    <span className={`text-sm font-mono ${dept.breaching_kri_count > 0 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                        {dept.breaching_kri_count}/{dept.total_kri_count}
                    </span>
                    <span className="text-eyebrow mt-0.5">
                        {t('department_table.breached')}
                    </span>
                </div>
            </TD>
            <TD>
                <DepartmentQuickActions
                    canUseDepartmentFilter={canUseDepartmentFilter}
                    departmentId={dept.department_id}
                    isSelected={isSelected}
                    navigate={navigate}
                    setDepartmentId={setDepartmentId}
                    t={t}
                />
            </TD>
        </TR>
    );
}
