import { useId } from 'react';
import { Building2, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';
import { EmptyState } from '@/components/ui/state';
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
    const headingId = useId();

    return (
        <div className="space-y-4">
            <h3 id={headingId} className="text-eyebrow flex items-center gap-2">
                <Building2 className="h-4 w-4 text-accent-text" aria-hidden="true" />
                {tAdmin('governance.resolve_modal.select_department')}
            </h3>
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
            {departments.length === 0 ? (
                <EmptyState layout="inline" kind="no-results" title={tAdmin('common:labels.no_results')} />
            ) : (
                // GAP-D-13: one radiogroup, so the selection is exposed to assistive technology
                // (a check mark and the card tint show it visually; colour is never the only cue).
                <RadioGroup
                    variant="card"
                    aria-labelledby={headingId}
                    value={selectedDepartmentId === null ? '' : String(selectedDepartmentId)}
                    onValueChange={(value) => setSelectedDepartmentId(Number(value))}
                    className="grid grid-cols-2 gap-2 space-y-0 md:grid-cols-4"
                    options={departments.map((department) => ({
                        value: String(department.id),
                        label: (
                            <>
                                <span className="text-eyebrow block">{department.code}</span>{' '}
                                <span className="block text-xs font-bold">{department.name}</span>
                            </>
                        ),
                    }))}
                />
            )}
        </div>
    );
}
