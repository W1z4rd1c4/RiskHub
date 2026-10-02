import { Search, Filter, Crown, Key } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { cn } from '@/lib/utils';
import { permissionResources, permissionActions } from '@/hooks/useUsersPageFilters';

interface UsersFilterBarProps {
    isAccessMode: boolean;
    roleOptions: Array<{ value: string; label: string }>;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    roleFilter: string;
    setRoleFilter: (role: string) => void;
    scopeFilter: string;
    setScopeFilter: (scope: string) => void;
    permResourceFilter: string;
    setPermResourceFilter: (resource: string) => void;
    permActionFilter: string;
    setPermActionFilter: (action: string) => void;
    hasPermFilters: boolean;
    resetPermissionFilters: () => void;
    filteredCount: number;
    totalCount: number;
}

export function UsersFilterBar({
    isAccessMode,
    roleOptions,
    searchTerm,
    setSearchTerm,
    roleFilter,
    setRoleFilter,
    scopeFilter,
    setScopeFilter,
    permResourceFilter,
    setPermResourceFilter,
    permActionFilter,
    setPermActionFilter,
    hasPermFilters,
    resetPermissionFilters,
    filteredCount,
    totalCount,
}: UsersFilterBarProps) {
    const { t } = useTranslation('admin');
    return (
        <div className="flex flex-col gap-4 mb-6">
            {/* Row 1: Search + Role + Scope */}
            <div className="flex flex-col md:flex-row gap-4">
                <Field
                    label={t('access.search_placeholder')}
                    labelVisuallyHidden
                    className="flex-1"
                >
                    {(field) => (
                        <Input
                            {...field}
                            type="text"
                            leadingIcon={Search}
                            placeholder={t('access.search_placeholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    )}
                </Field>
                <div className="flex gap-2 flex-wrap">
                    <div className="relative">
                        <Filter aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                        <ThemedSelect
                            triggerAriaLabel={t('common:labels.role')}
                            value={roleFilter}
                            onValueChange={setRoleFilter}
                            placeholder={t('access.roles.all')}
                            allowEmpty
                            emptyLabel={t('access.roles.all')}
                            className="pl-9"
                            options={roleOptions}
                        />
                    </div>
                    {isAccessMode && (
                        <div className="relative">
                            <Crown aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                            <ThemedSelect
                                triggerAriaLabel={t('access.access_scope')}
                                value={scopeFilter}
                                onValueChange={setScopeFilter}
                                placeholder={t('access.scopes.all')}
                                allowEmpty
                                emptyLabel={t('access.scopes.all')}
                                className="pl-9"
                                options={[
                                    { value: 'global', label: t('access.scopes.global') },
                                    { value: 'department', label: t('access.scopes.department') },
                                    { value: 'manager', label: t('access.scopes.manager') },
                                ]}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Row 2: Permission Filters (Access Mode only) */}
            {isAccessMode && (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Key aria-hidden="true" className="h-3.5 w-3.5" />
                        {t('access.filter_by_capability')}
                    </span>
                    <ThemedSelect
                        triggerAriaLabel={t('access.matrix.resource')}
                        value={permResourceFilter}
                        onValueChange={setPermResourceFilter}
                        className={cn(
                            permResourceFilter !== 'all' && "border-chart-2/50"
                        )}
                        options={permissionResources.map(r => ({ value: r.value, label: t(r.labelKey) }))}
                    />
                    <ThemedSelect
                        triggerAriaLabel={t('access.table.actions')}
                        value={permActionFilter}
                        onValueChange={setPermActionFilter}
                        className={cn(
                            permActionFilter !== 'all' && "border-success/50"
                        )}
                        options={permissionActions.map(a => ({ value: a.value, label: t(a.labelKey) }))}
                    />
                    {hasPermFilters && (
                        <Button type="button" variant="ghost" size="compact" onClick={resetPermissionFilters}>
                            {t('access.clear')}
                        </Button>
                    )}
                    <span className="text-xs text-muted-foreground ml-2">
                        {t('access.of_users', { shown: filteredCount, count: totalCount })}
                    </span>
                </div>
            )}
        </div>
    );
}
