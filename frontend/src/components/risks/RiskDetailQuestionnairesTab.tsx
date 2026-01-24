import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, FileText, Send, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Risk } from '@/types/risk';
import type { RiskQuestionnaireListItem } from '@/types/riskQuestionnaire';
import { riskQuestionnairesApi } from '@/services/riskQuestionnairesApi';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { RiskQuestionnaireDetail } from './RiskQuestionnaireDetail';

interface RiskDetailQuestionnairesTabProps {
    risk: Risk;
}

function formatDate(value?: string | null) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
}

function isOverdue(item: RiskQuestionnaireListItem): boolean {
    if (item.status === 'submitted') return false;
    return new Date(item.due_at).getTime() < Date.now();
}

export function RiskDetailQuestionnairesTab({ risk }: RiskDetailQuestionnairesTabProps) {
    const { t } = useTranslation(['common', 'risks']);
    const { user } = useAuth();

    const [items, setItems] = useState<RiskQuestionnaireListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<number | null>(null);

    const canSend = user?.role === 'risk_manager' || user?.role === 'cro';

    const openItem = useMemo(
        () => items.find(i => i.status === 'sent' || i.status === 'in_progress') ?? null,
        [items]
    );

    const statusBadge = (status: string, overdue: boolean) => {
        if (overdue) {
            return (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-rose-500/10 border-rose-500/20 text-rose-400">
                    {t('risks:questionnaire.status.overdue', 'Overdue')}
                </span>
            );
        }
        if (status === 'sent') {
            return (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-amber-500/10 border-amber-500/20 text-amber-400">
                    {t('risks:questionnaire.status.sent', 'Pending')}
                </span>
            );
        }
        if (status === 'in_progress') {
            return (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-accent/10 border-accent/20 text-accent">
                    {t('risks:questionnaire.status.in_progress', 'In progress')}
                </span>
            );
        }
        if (status === 'submitted') {
            return (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                    {t('risks:questionnaire.status.submitted', 'Submitted')}
                </span>
            );
        }
        return (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-white/5 border-white/10 text-slate-300">
                {status}
            </span>
        );
    };

    const refresh = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await riskQuestionnairesApi.listForRisk(risk.id);
            setItems(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : t('errors.generic'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable enough for this component
    }, [risk.id]);

    const handleSend = async () => {
        if (!canSend) return;
        setMessage(null);
        setError(null);
        setSending(true);
        try {
            await riskQuestionnairesApi.sendForRisk(risk.id);
            setMessage(t('risks:questionnaires.send_success', 'Questionnaire sent.'));
            await refresh();
        } catch (e) {
            const msg = e instanceof Error ? e.message : t('errors.generic');
            if (msg.toLowerCase().includes('open questionnaire already exists')) {
                setMessage(t('risks:questionnaires.send_open_exists', 'An open questionnaire already exists. Opening it.'));
                await refresh();
                if (openItem) setSelectedId(openItem.id);
                return;
            }
            setError(msg);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="glass-card !p-0 overflow-hidden">
            {message && (
                <div className="p-4 border-b border-white/5 text-sm text-amber-400 bg-amber-500/5">
                    {message}
                </div>
            )}

            {error && (
                <div className="p-4 border-b border-rose-500/20 text-sm text-rose-400 bg-rose-500/10 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                </div>
            )}

            <div className="p-6 border-b border-white/5 flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-widest mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-accent" />
                        {t('risks:questionnaires.title', 'Risk Assessment')}
                    </h3>
                    <p className="text-slate-500 text-sm">
                        {t('risks:questionnaires.subtitle', 'Questionnaire history and current status for this risk.')}
                    </p>

                    {openItem && (
                        <div className="mt-3 flex items-center gap-3">
                            {statusBadge(openItem.status, isOverdue(openItem))}
                            <span className="text-xs text-slate-400">
                                {t('risks:questionnaires.current_due', 'Due')}: {formatDate(openItem.due_at)}
                            </span>
                            <button
                                onClick={() => setSelectedId(openItem.id)}
                                className="text-xs text-accent hover:text-accent/80 font-bold"
                            >
                                {t('risks:questionnaires.open', 'Open')}
                            </button>
                        </div>
                    )}
                </div>

                {canSend && (
                    <div className="flex flex-col items-end gap-2">
                        <button
                            onClick={handleSend}
                            disabled={sending || !risk.owner_id}
                            className={cn(
                                "inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all",
                                "bg-accent/20 border-accent/30 text-accent hover:bg-accent/30 hover:border-accent/50",
                                (sending || !risk.owner_id) && "opacity-50 cursor-not-allowed"
                            )}
                            title={!risk.owner_id ? t('risks:questionnaires.send_requires_owner', 'Set a risk owner to send a questionnaire.') : undefined}
                        >
                            {!risk.owner_id ? <UserX className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                            {t('risks:questionnaires.send', 'Send questionnaire')}
                        </button>
                        {!risk.owner_id && (
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                {t('risks:questionnaires.owner_required', 'Owner required')}
                            </p>
                        )}
                    </div>
                )}
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/5">
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {t('common:labels.status')}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {t('risks:questionnaires.columns.sent_at', 'Sent')}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {t('risks:questionnaires.columns.due_at', 'Due')}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {t('risks:questionnaires.columns.submitted_at', 'Submitted')}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {t('risks:questionnaires.columns.sent_by', 'Sent by')}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {t('risks:questionnaires.columns.submitted_by', 'Submitted by')}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-6 text-slate-400 text-sm">
                                    {t('loading.generic')}
                                </td>
                            </tr>
                        ) : items.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-10 text-slate-500 text-sm">
                                    {t('risks:questionnaires.empty', 'No questionnaires have been sent for this risk yet.')}
                                </td>
                            </tr>
                        ) : (
                            items.map((q) => (
                                <tr
                                    key={q.id}
                                    className="hover:bg-white/5 cursor-pointer"
                                    onClick={() => setSelectedId(q.id)}
                                >
                                    <td className="px-4 py-3">
                                        {statusBadge(q.status, isOverdue(q))}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(q.sent_at)}</td>
                                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(q.due_at)}</td>
                                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(q.submitted_at)}</td>
                                    <td className="px-4 py-3 text-sm text-slate-300">{q.sent_by_user_name ?? q.sent_by_user_id}</td>
                                    <td className="px-4 py-3 text-sm text-slate-300">{q.submitted_by_user_name ?? (q.submitted_by_user_id ?? '—')}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <RiskQuestionnaireDetail
                isOpen={selectedId !== null}
                questionnaireId={selectedId}
                risk={risk}
                onClose={() => setSelectedId(null)}
                onChanged={refresh}
            />
        </div>
    );
}

