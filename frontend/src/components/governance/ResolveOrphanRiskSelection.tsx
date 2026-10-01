import { Check, Target } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { Input } from '@/components/ui/input';
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

    return (
        <div className="space-y-4">
            <h5 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <Target className="h-4 w-4 text-accent" />
                {tAdmin('governance.resolve_modal.select_risk_to_link')}
            </h5>
            <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <ThemedSelect
                        value={selectedRiskDept}
                        onValueChange={setSelectedRiskDept}
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

                <div className="max-h-[200px] overflow-y-auto rounded-xl border border-border divide-y divide-border custom-scrollbar">
                    {filteredRisks.map((risk) => (
                        <button
                            key={risk.id}
                            onClick={() => setSelectedRiskId(risk.id)}
                            className={`w-full text-left p-3 flex items-center gap-3 transition-colors ${selectedRiskId === risk.id ? 'bg-accent/10' : 'hover:bg-tint/5'}`}
                        >
                            <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${selectedRiskId === risk.id ? 'bg-accent text-accent-foreground' : 'bg-tint/5 text-muted-foreground'}`}>
                                <Target className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col">
                                <p className="text-sm font-bold text-foreground leading-tight mb-1">{risk.name}</p>
                                <p className="text-xs text-muted-foreground line-clamp-1 italic">{risk.description}</p>
                            </div>
                            {selectedRiskId === risk.id && <Check className="h-4 w-4 text-accent" />}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
