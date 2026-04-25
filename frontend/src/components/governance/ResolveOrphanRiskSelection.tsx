import { Check, Target } from 'lucide-react';

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

    return (
        <div className="space-y-4">
            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
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
                    <input
                        type="text"
                        placeholder={t('filters.search_risks')}
                        value={riskSearchQuery}
                        onChange={(event) => setRiskSearchQuery(event.target.value)}
                        className="col-span-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-accent/40"
                    />
                </div>

                <div className="max-h-[200px] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5 custom-scrollbar">
                    {filteredRisks.map((risk) => (
                        <button
                            key={risk.id}
                            onClick={() => setSelectedRiskId(risk.id)}
                            className={`w-full text-left p-3 flex items-center gap-3 transition-colors ${selectedRiskId === risk.id ? 'bg-accent/10' : 'hover:bg-white/5'}`}
                        >
                            <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${selectedRiskId === risk.id ? 'bg-accent text-white' : 'bg-white/5 text-slate-600'}`}>
                                <Target className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col">
                                <p className="text-sm font-bold text-slate-200 leading-tight mb-1">{risk.name}</p>
                                <p className="text-[10px] text-slate-500 line-clamp-1 italic">{risk.description}</p>
                            </div>
                            {selectedRiskId === risk.id && <Check className="h-4 w-4 text-accent" />}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
