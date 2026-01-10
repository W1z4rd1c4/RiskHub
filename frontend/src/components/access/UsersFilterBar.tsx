import { Search, Filter, Crown, Key } from 'lucide-react';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { cn } from '@/lib/utils';
import { permissionResources, permissionActions } from '@/hooks/useUsersPageFilters';

interface UsersFilterBarProps {
    isAccessMode: boolean;
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
    return (
        <div className="flex flex-col gap-4 mb-6">
            {/* Row 1: Search + Role + Scope */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 z-10 pointer-events-none" />
                        <ThemedSelect
                            value={roleFilter}
                            onValueChange={setRoleFilter}
                            placeholder="All Roles"
                            allowEmpty
                            emptyLabel="All Roles"
                            className="pl-9"
                            options={[
                                { value: 'admin', label: 'Admins' },
                                { value: 'cro', label: 'CROs' },
                                { value: 'risk_manager', label: 'Risk Managers' },
                                { value: 'department_head', label: 'Dept Heads' },
                                { value: 'control_owner', label: 'Control Owners' },
                            ]}
                        />
                    </div>
                    {isAccessMode && (
                        <div className="relative">
                            <Crown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 z-10 pointer-events-none" />
                            <ThemedSelect
                                value={scopeFilter}
                                onValueChange={setScopeFilter}
                                placeholder="All Scopes"
                                allowEmpty
                                emptyLabel="All Scopes"
                                className="pl-9"
                                options={[
                                    { value: 'global', label: 'Global' },
                                    { value: 'department', label: 'Department' },
                                    { value: 'manager', label: 'Manager' },
                                ]}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Row 2: Permission Filters (Access Mode only) */}
            {isAccessMode && (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                        <Key className="h-3.5 w-3.5" />
                        Filter by Capability:
                    </span>
                    <ThemedSelect
                        value={permResourceFilter}
                        onValueChange={setPermResourceFilter}
                        className={cn(
                            permResourceFilter !== 'all' && "border-purple-500/50"
                        )}
                        options={permissionResources.map(r => ({ value: r.value, label: r.label }))}
                    />
                    <ThemedSelect
                        value={permActionFilter}
                        onValueChange={setPermActionFilter}
                        className={cn(
                            permActionFilter !== 'all' && "border-emerald-500/50"
                        )}
                        options={permissionActions.map(a => ({ value: a.value, label: a.label }))}
                    />
                    {hasPermFilters && (
                        <button
                            onClick={resetPermissionFilters}
                            className="text-xs text-slate-500 hover:text-white underline transition-colors"
                        >
                            Clear
                        </button>
                    )}
                    <span className="text-xs text-slate-500 ml-2">
                        {filteredCount} of {totalCount} users
                    </span>
                </div>
            )}
        </div>
    );
}
