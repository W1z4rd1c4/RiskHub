import { useId } from 'react';
import { Target } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';
import { EmptyState } from '@/components/ui/state';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import type { RiskSummary } from '@/types/risk';

interface ResolveOrphanRiskSelectionProps {
    filteredRisks: RiskSummary[];
    riskSearchQuery: string;
    selectedRiskDept: string;
    selectedRiskId: number | null;
    setRiskSearchQuery: (value: string) => void;
    setSelectedRiskDept: (value: string) => void;
    setSelectedRiskId: (value: number) => void;
    uniqueDepartments: string[];
}

export function ResolveOrphanRiskSelection({
    filteredRisks,
    riskSearchQuery,
    selectedRiskDept,
    selectedRiskId,
    setRiskSearchQuery,
    setSelectedRiskDept,
    setSelectedRiskId,
    uniqueDepartments,
}: ResolveOrphanRiskSelectionProps) {
    const { t } = useTranslation('common');
    const { t: tAdmin } = useTranslation('admin');
    const headingId = useId();

    return (
        <div className="space-y-4">
            <h3 id={headingId} className="text-eyebrow flex items-center gap-2">
                <Target className="h-4 w-4 text-accent-text" aria-hidden="true" />
                {tAdmin('governance.resolve_modal.select_risk_to_link')}
            </h3>
            <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <ThemedSelect
                        value={selectedRiskDept}
                        onValueChange={setSelectedRiskDept}
                        triggerAriaLabel={t('filters.all_departments')}
                        placeholder={t('filters.all_departments')}
                        allowEmpty
                        emptyLabel={t('filters.all_departments')}
                        options={uniqueDepartments.map((department) => ({ value: department, label: department }))}
                    />
                    <div className="col-span-2">
                        <Input
                            type="text"
                            aria-label={t('filters.search_risks')}
                            placeholder={t('filters.search_risks')}
                            value={riskSearchQuery}
                            onChange={(event) => setRiskSearchQuery(event.target.value)}
                        />
                    </div>
                </div>

                {filteredRisks.length === 0 ? (
                    <EmptyState layout="inline" kind="no-results" title={t('empty.no_risks_found')} />
                ) : (
                    // GAP-D-13: a radiogroup (single selection) in a scrollable list.
                    <RadioGroup
                        variant="card"
                        aria-labelledby={headingId}
                        value={selectedRiskId === null ? '' : String(selectedRiskId)}
                        onValueChange={(value) => setSelectedRiskId(Number(value))}
                        className="custom-scrollbar max-h-[200px] space-y-1 overflow-y-auto"
                        options={filteredRisks.map((risk) => ({
                            value: String(risk.id),
                            label: (
                                <>
                                    <span className="block text-sm font-bold leading-tight">{risk.name}</span>{' '}
                                    <span className="block line-clamp-1 text-xs font-normal italic text-muted-foreground">
                                        {risk.description}
                                    </span>
                                </>
                            ),
                        }))}
                    />
                )}
            </div>
        </div>
    );
}
