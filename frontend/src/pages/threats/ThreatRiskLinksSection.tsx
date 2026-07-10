import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldAlert, Trash2 } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { logError } from '@/services/logger';
import { riskApi } from '@/services/riskApi';
import { threatApi } from '@/services/threatApi';
import type { Threat } from '@/types/threat';

import {
    buildLinkTargetOptions,
    canDeleteThreatRiskLink,
    parseLinkTargetId,
} from './threatRiskLinksPresentation';

interface ThreatRiskLinksSectionProps {
    threat: Threat;
    canManageLinks: boolean;
    onLinksChanged?: () => void | Promise<void>;
}

/** The Threat<->Risk Link relations managed from the Threat page (issue #47). */
export function ThreatRiskLinksSection({ threat, canManageLinks, onLinksChanged }: ThreatRiskLinksSectionProps) {
    const { t } = useTranslation('threats');
    const queryClient = useQueryClient();
    const [linkError, setLinkError] = useState<string | null>(null);
    const [riskToLink, setRiskToLink] = useState('');

    const riskLinksQuery = useQuery({
        queryKey: ictRegisterKeys.threatRiskLinks(threat.id),
        queryFn: () => threatApi.getRiskLinks(threat.id),
    });
    const riskOptionsQuery = useQuery({
        queryKey: ictRegisterKeys.riskOptions(),
        queryFn: () => riskApi.getRisks({ offset: 0, limit: 100 }),
        staleTime: 60_000,
    });

    const riskNameById = useMemo(() => {
        const map = new Map<number, string>();
        for (const risk of riskOptionsQuery.data?.items ?? []) {
            map.set(risk.id, `${risk.risk_id_code}: ${risk.name}`);
        }
        return map;
    }, [riskOptionsQuery.data]);

    const refreshLinks = async () => {
        await queryClient.invalidateQueries({ queryKey: ictRegisterKeys.threatRiskLinks(threat.id) });
        await onLinksChanged?.();
    };

    const handleMutationError = (mutationError: unknown) => {
        logError('Threat risk link mutation failed:', mutationError);
        setLinkError(t('links.errors.mutation_failed'));
    };

    const targetRiskId = parseLinkTargetId(riskToLink);

    const addRiskLink = useMutation({
        mutationFn: () => {
            if (targetRiskId === null) {
                return Promise.reject(new Error('Risk is required'));
            }
            return threatApi.addRiskLink(threat.id, targetRiskId);
        },
        onSuccess: async () => {
            setLinkError(null);
            setRiskToLink('');
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const removeRiskLink = useMutation({
        mutationFn: (linkId: number) => threatApi.removeRiskLink(threat.id, linkId),
        onSuccess: async () => {
            setLinkError(null);
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const riskLinks = riskLinksQuery.data ?? [];
    const linkedRiskIds = new Set(riskLinks.map((link) => link.risk_id));
    const riskOptions = buildLinkTargetOptions(
        (riskOptionsQuery.data?.items ?? []).map((risk) => ({
            id: risk.id,
            label: `${risk.risk_id_code}: ${risk.name}`,
            isArchived: risk.is_archived,
        })),
        linkedRiskIds,
    );

    return (
        <div className="glass-card space-y-5" data-testid="threat-risk-links-section">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <ShieldAlert className="h-5 w-5 text-rose-400" />
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('links.risks.title')}
                </h2>
            </div>

            {linkError ? (
                <div className="border border-rose-400/30 rounded-xl px-4 py-3 text-rose-300 text-sm font-medium">
                    {linkError}
                </div>
            ) : null}

            <div className="space-y-4">
                {riskLinks.length === 0 ? (
                    <p className="text-xs text-slate-500">{t('links.risks.empty')}</p>
                ) : (
                    <ul className="space-y-2" data-testid="threat-risk-links">
                        {riskLinks.map((link) => (
                            <li
                                key={link.id}
                                className="flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                            >
                                <span className="text-sm font-bold text-white truncate">
                                    {riskNameById.get(link.risk_id) ?? `#${link.risk_id}`}
                                </span>
                                {canManageLinks && canDeleteThreatRiskLink(link) ? (
                                    <button
                                        type="button"
                                        data-testid={`threat-risk-link-remove-${link.id}`}
                                        onClick={() => removeRiskLink.mutate(link.id)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                        title={t('links.remove')}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}

                {canManageLinks ? (
                    <div className="border-t border-white/5 pt-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                        <div className="md:col-span-3">
                            <ThemedSelect
                                value={riskToLink}
                                onValueChange={setRiskToLink}
                                options={riskOptions}
                                placeholder={t('links.risks.select_placeholder')}
                                triggerTestId="threat-risk-link-select"
                            />
                        </div>
                        <button
                            type="button"
                            data-testid="threat-risk-link-add"
                            disabled={targetRiskId === null || addRiskLink.isPending}
                            onClick={() => addRiskLink.mutate()}
                            className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            {t('links.add')}
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
