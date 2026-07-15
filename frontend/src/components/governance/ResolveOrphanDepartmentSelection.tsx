import { Building2, Search } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { OrphanDepartmentOption } from './resolveOrphanHelpers';

interface ResolveOrphanDepartmentSelectionProps {
    departments: OrphanDepartmentOption[];
    isSearchable: boolean;
    searchQuery: string;
    selectedDepartmentId: number | null;
    setSearchQuery: (value: string) => void;
    setSelectedDepartmentId: (value: number) => void;
}

export function ResolveOrphanDepartmentSelection({
    departments,
    isSearchable,
    searchQuery,
    selectedDepartmentId,
    setSearchQuery,
    setSelectedDepartmentId,
}: ResolveOrphanDepartmentSelectionProps) {
    const { t: tAdmin } = useTranslation('admin');

    return (
        <div className="space-y-4">
            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-400" />
                {tAdmin('governance.resolve_modal.select_department')}
            </h5>
            {isSearchable && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                        type="search"
                        data-testid="process-department-search"
                        placeholder={tAdmin('common:filters.search_items')}
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white outline-none focus:border-blue-400/40"
                    />
                </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {departments.map((department) => (
                    <button
                        type="button"
                        key={department.id}
                        onClick={() => setSelectedDepartmentId(department.id)}
                        className={`p-3 rounded-xl border text-center transition-all ${selectedDepartmentId === department.id ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                    >
                        <p className="text-[10px] font-bold text-slate-500 uppercase">{department.code}</p>
                        <p className={`text-xs font-bold ${selectedDepartmentId === department.id ? 'text-white' : 'text-slate-400'}`}>
                            {department.name}
                        </p>
                    </button>
                ))}
            </div>
        </div>
    );
}
