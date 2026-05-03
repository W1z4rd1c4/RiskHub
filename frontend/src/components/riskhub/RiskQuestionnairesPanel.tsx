import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, FileText, RefreshCw, Send } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { departmentApi } from '@/services/departmentApi';
import type { RiskStatus } from '@/types/risk';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { cn } from '@/lib/utils';
import { logError } from '@/services/logger';
import { riskHubCapabilityEnabled, useRiskHubCapabilities } from './useRiskHubCapabilities';
import {
    type BatchSendResponse,
    useRiskQuestionnaireBatchSend,
    useRiskQuestionnaireFilters,
    useRiskQuestionnaireRisks,
    useRiskQuestionnaireSelection,
} from './riskQuestionnairePanelState';

export function RiskQuestionnairesPanel() {
    const { t } = useTranslation('admin');
    const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [result, setResult] = useState<BatchSendResponse | null>(null);
    const { data: riskHubCapabilities } = useRiskHubCapabilities();
    const canBatchSend = riskHubCapabilityEnabled(riskHubCapabilities?.questionnaires, 'can_batch_send');
    const {
        category,
        departmentId,
        filters,
        process,
        setCategory,
        setDepartmentId,
        setProcess,
        setStatus,
        status,
    } = useRiskQuestionnaireFilters();
    const { fetchRisks, loading, risks } = useRiskQuestionnaireRisks(filters);
    const {
        allVisibleSelected,
        selectedIds,
        selectAll,
        setSelectedIds,
        toggleAllVisible,
        toggleRisk,
        updateSelectAll,
    } = useRiskQuestionnaireSelection(risks);
    const { handleBatchSend, sending } = useRiskQuestionnaireBatchSend({
        fetchRisks: () => fetchRisks(() => {
            setErrorKey(null);
            setResult(null);
        }, setErrorKey),
        filters,
        selectedIds,
        selectAll,
        setErrorKey,
        setResult,
        setSelectedIds,
    });

    useEffect(() => {
        const loadDepartments = async () => {
            try {
                const depts = await departmentApi.getDepartments();
                setDepartments(depts.map(d => ({ value: String(d.id), label: d.name })));
            } catch (e) {
                // Non-blocking
                logError('Failed to load departments', e);
            }
        };
        void loadDepartments();
    }, []);

    useEffect(() => {
        void fetchRisks(() => {
            setErrorKey(null);
            setResult(null);
        }, setErrorKey);
    }, [fetchRisks]);

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <FileText className="h-5 w-5 text-accent" />
                        {t('riskhub.tabs.questionnaires')}
                    </h3>
                    <p className="text-slate-400 text-sm">
                        {t('riskhub.questionnaires.subtitle')}
                    </p>
                </div>
                <button
                    onClick={() => fetchRisks(() => {
                        setErrorKey(null);
                        setResult(null);
                    }, setErrorKey)}
                    disabled={loading}
                    className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all",
                        "bg-white/5 border-white/10 text-white hover:bg-white/10",
                        loading && "opacity-50 cursor-not-allowed"
                    )}
                >
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    {t('actions.refresh')}
                </button>
            </div>

            {errorKey && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {errorKey.startsWith('errorKeys.')
                        ? t(errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                        : t(errorKey)}
                </div>
            )}

            {result && (
                <div className="p-4 rounded-xl border bg-emerald-500/5 border-emerald-500/20 text-emerald-300">
                    <div className="flex items-center gap-2 font-bold">
                        <CheckCircle className="h-4 w-4" />
                        {t('riskhub.questionnaires.results')}
                    </div>
                    <div className="mt-2 text-sm text-slate-300 space-y-1">
                        <div>{t('riskhub.questionnaires.created')}: {result.created_count}</div>
                        <div>{t('riskhub.questionnaires.skipped_no_owner')}: {result.skipped_no_owner.length}</div>
                        <div>{t('riskhub.questionnaires.skipped_open')}: {result.skipped_open_exists.length}</div>
                        {result.errors.length > 0 && (
                            <div className="text-rose-300">{t('riskhub.questionnaires.errors')}: {result.errors.length}</div>
                        )}
                    </div>
                </div>
            )}

            <div className="glass-card !p-0 overflow-hidden">
                <div className="p-4 border-b border-white/5 grid grid-cols-1 md:grid-cols-5 gap-3">
                    <ThemedSelect
                        value={departmentId}
                        onValueChange={setDepartmentId}
                        placeholder={t('riskhub.questionnaires.department')}
                        allowEmpty
                        emptyLabel={t('riskhub.questionnaires.all_departments')}
                        options={departments}
                    />
                    <input
                        value={process}
                        onChange={(e) => setProcess(e.target.value)}
                        placeholder={t('riskhub.questionnaires.process')}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-accent/50"
                    />
                    <input
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder={t('riskhub.questionnaires.category')}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-accent/50"
                    />
                    <ThemedSelect
                        value={status}
                        onValueChange={(v) => setStatus(v as RiskStatus | '')}
                        placeholder={t('common:labels.status')}
                        allowEmpty
                        emptyLabel={t('riskhub.questionnaires.all_statuses')}
                        options={[
                            { value: 'active', label: t('riskhub.questionnaires.status_active') },
                            { value: 'emerging', label: t('riskhub.questionnaires.status_emerging') },
                        ]}
                    />
                    {canBatchSend ? (
                        <label className="flex items-center gap-2 text-xs text-slate-300 font-bold select-none">
                            <input
                                type="checkbox"
                                checked={selectAll}
                                onChange={(e) => updateSelectAll(e.target.checked)}
                                className="accent-accent"
                            />
                            {t('riskhub.questionnaires.select_all')}
                        </label>
                    ) : null}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {canBatchSend ? (
                                        <input
                                            type="checkbox"
                                            checked={selectAll ? true : allVisibleSelected}
                                            onChange={toggleAllVisible}
                                            disabled={selectAll || risks.length === 0}
                                            className="accent-accent"
                                        />
                                    ) : null}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {t('governance.col_name')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {t('governance.col_description')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {t('governance.col_department')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {t('riskhub.questionnaires.owner')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-6 text-slate-400 text-sm">
                                        {t('console.loading')}
                                    </td>
                                </tr>
                            ) : risks.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-10 text-slate-500 text-sm">
                                        {t('riskhub.questionnaires.empty')}
                                    </td>
                                </tr>
                            ) : (
                                risks.map(risk => (
                                    <tr key={risk.id} className="hover:bg-white/5">
                                        <td className="px-4 py-3">
                                            {canBatchSend ? (
                                                <input
                                                    type="checkbox"
                                                    checked={selectAll ? true : selectedIds.has(risk.id)}
                                                    onChange={() => toggleRisk(risk.id)}
                                                    disabled={selectAll}
                                                    className="accent-accent"
                                                />
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3 text-sm font-bold text-white">{risk.name}</td>
                                        <td className="px-4 py-3 text-sm text-slate-400">{risk.description}</td>
                                        <td className="px-4 py-3 text-sm text-slate-400">{risk.department_name ?? '—'}</td>
                                        <td className="px-4 py-3 text-sm text-slate-400">
                                            {risk.owner_id ? (risk.owner_name ?? t('common:fallbacks.unknown_user')) : '—'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {canBatchSend ? (
                    <div className="p-4 border-t border-white/5 flex items-center justify-between">
                        <div className="text-xs text-slate-500">
                            {selectAll
                                ? t('riskhub.questionnaires.select_all_hint')
                                : t('riskhub.questionnaires.selected_count', { count: selectedIds.size })}
                        </div>
                        <button
                            onClick={handleBatchSend}
                            disabled={sending || (!selectAll && selectedIds.size === 0)}
                            className={cn(
                                "inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all",
                                "bg-accent/20 border-accent/30 text-accent hover:bg-accent/30 hover:border-accent/50",
                                (sending || (!selectAll && selectedIds.size === 0)) && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <Send className={cn("h-4 w-4", sending && "animate-pulse")} />
                            {t('riskhub.questionnaires.send')}
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
