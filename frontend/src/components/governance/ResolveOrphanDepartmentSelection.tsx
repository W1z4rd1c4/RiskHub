import { Building2, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
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
            <h5 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <Building2 className="h-4 w-4 text-accent-text" />
                {tAdmin('governance.resolve_modal.select_department')}
            </h5>
            {isSearchable && (
                <Input
                    type="search"
                    leadingIcon={Search}
                    data-testid="process-department-search"
                    aria-label={tAdmin('common:filters.search_items')}
                    placeholder={tAdmin('common:filters.search_items')}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                />
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {departments.map((department) => (
                    <button
                        type="button"
                        key={department.id}
                        onClick={() => setSelectedDepartmentId(department.id)}
                        className={`p-3 rounded-xl border text-center transition-all ${selectedDepartmentId === department.id ? 'bg-tint/10 border-tint/30' : 'bg-tint/5 border-border hover:bg-tint/10'}`}
                    >
                        <p className="text-eyebrow">{department.code}</p>
                        <p className={`text-xs font-bold ${selectedDepartmentId === department.id ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {department.name}
                        </p>
                    </button>
                ))}
            </div>
        </div>
    );
}
