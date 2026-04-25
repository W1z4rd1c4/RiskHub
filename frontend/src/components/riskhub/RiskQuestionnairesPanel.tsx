import { useEffect, useMemo, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle, FileText, RefreshCw, Send } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { batchSendResponseSchema } from '@/services/api/schemas';
import { departmentApi } from '@/services/departmentApi';
import { riskApi } from '@/services/riskApi';
import { apiClient } from '@/services/apiClient';
import type { RiskSummary, RiskStatus } from '@/types/risk';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { cn } from '@/lib/utils';
import { logError } from '@/services/logger';

type BatchSendResponse = {
    created_count: number;
    skipped_no_owner: number[];
    skipped_open_exists: number[];
    errors: string[];
};

export function RiskQuestionnairesPanel() {
    const { t } = useTranslation('admin');
    const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const [departmentId, setDepartmentId] = useState<string>('');
    const [process, setProcess] = useState('');
    const [category, setCategory] = useState('');
    const [status, setStatus] = useState<RiskStatus | ''>('active');

    const [selectAll, setSelectAll] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [risks, setRisks] = useState<RiskSummary[]>([]);
    const [result, setResult] = useState<BatchSendResponse | null>(null);

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

    const filters = useMemo(() => {
        return {
            department_id: departmentId ? Number(departmentId) : undefined,
            process: process.trim() || undefined,
            category: category.trim() || undefined,
            status: status || undefined,
        };
    }, [category, departmentId, process, status]);

    const fetchRisks = useCallback(async () => {
        setLoading(true);
        setErrorKey(null);
        setResult(null);
        try {
            const resp = await riskApi.getRisks({
                offset: 0,
                limit: 50,
                department_id: filters.department_id,
                process: filters.process,
                category: filters.category,
                status: (filters.status as RiskStatus) || undefined,
                include_archived: false,
            });
            setRisks(resp.items);
        } catch (e) {
            setErrorKey('errors.failed_to_load');
            logError('Failed to load questionnaire risks.', e);
        } finally {
            setLoading(false);
        }
    }, [filters.category, filters.department_id, filters.process, filters.status]);

    useEffect(() => {
        void fetchRisks();
    }, [fetchRisks]);

    const toggleRisk = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAllVisible = () => {
        if (selectAll) return;
        const allIds = risks.map(r => r.id);
        const allSelected = allIds.every(id => selectedIds.has(id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) {
                allIds.forEach(id => next.delete(id));
            } else {
                allIds.forEach(id => next.add(id));
            }
            return next;
        });
    };

    const handleBatchSend = async () => {
        setSending(true);
        setErrorKey(null);
        setResult(null);
        try {
            const payload = selectAll
                ? {
                    select_all: true,
                    filters: {
                        department_id: filters.department_id,
                        process: filters.process,
                        category: filters.category,
                        status: filters.status || undefined,
                    },
                }
                : {
                    select_all: false,
                    risk_ids: Array.from(selectedIds),
                };

            if (!selectAll && selectedIds.size === 0) {
                setErrorKey('riskhub.questionnaires.select_some');
                return;
            }

            const resp = await apiClient.post('/riskhub/questionnaires/batch-send', payload, {
                schema: batchSendResponseSchema,
            });
            setResult(resp);
            setSelectedIds(new Set());
            await fetchRisks();
        } catch (e) {
            setErrorKey(apiClient.toUiMessageKey(e));
        } finally {
            setSending(false);
        }
    };

    const allVisibleSelected = risks.length > 0 && risks.every(r => selectedIds.has(r.id));

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
                    onClick={fetchRisks}
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
                    <label className="flex items-center gap-2 text-xs text-slate-300 font-bold select-none">
                        <input
                            type="checkbox"
                            checked={selectAll}
                            onChange={(e) => {
                                setSelectAll(e.target.checked);
                                setSelectedIds(new Set());
                            }}
                            className="accent-accent"
                        />
                        {t('riskhub.questionnaires.select_all')}
                    </label>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    <input
                                        type="checkbox"
                                        checked={selectAll ? true : allVisibleSelected}
                                        onChange={toggleAllVisible}
                                        disabled={selectAll || risks.length === 0}
                                        className="accent-accent"
                                    />
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
                                            <input
                                                type="checkbox"
                                                checked={selectAll ? true : selectedIds.has(risk.id)}
                                                onChange={() => toggleRisk(risk.id)}
                                                disabled={selectAll}
                                                className="accent-accent"
                                            />
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
            </div>
        </div>
    );
}
