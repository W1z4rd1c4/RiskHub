import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flame, Plus, Server, Trash2, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { logError } from '@/services/logger';
import { assetApi } from '@/services/assetApi';
import { processApi } from '@/services/processApi';
import { riskRegisterLinksApi, threatApi } from '@/services/threatApi';
import type { Risk } from '@/types/risk';

import {
    buildRegisterLinkOptions,
    canDeleteRegisterLink,
    parseRegisterLinkTargetId,
    registerLinkRowName,
} from './riskRegisterLinksPresentation';

interface RiskRegisterLinksSectionProps {
    risk: Risk;
    canManageLinks: boolean;
}

interface LinkBlockProps {
    icon: LucideIcon;
    iconClass: string;
    title: string;
    emptyLabel: string;
    selectPlaceholder: string;
    addLabel: string;
    removeLabel: string;
    testIdPrefix: string;
    canManageLinks: boolean;
    rows: Array<{ id: number; name: string; canDelete: boolean }>;
    options: Array<{ value: string; label: string }>;
    searchValue: string;
    onSearchChange: (value: string) => void;
    onAdd: (targetId: number) => void;
    onRemove: (linkId: number) => void;
    isAddPending: boolean;
}

function LinkBlock({
    icon: Icon,
    iconClass,
    title,
    emptyLabel,
    selectPlaceholder,
    addLabel,
    removeLabel,
    testIdPrefix,
    canManageLinks,
    rows,
    options,
    searchValue,
    onSearchChange,
    onAdd,
    onRemove,
    isAddPending,
}: LinkBlockProps) {
    const [targetToLink, setTargetToLink] = useState('');
    const targetId = parseRegisterLinkTargetId(targetToLink);

    return (
        <div className="space-y-4" data-testid={`${testIdPrefix}-block`}>
            <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${iconClass}`} />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">{title}</h3>
            </div>
            {rows.length === 0 ? (
                <p className="text-xs text-slate-500">{emptyLabel}</p>
            ) : (
                <ul className="space-y-2" data-testid={`${testIdPrefix}-rows`}>
                    {rows.map((row) => (
                        <li
                            key={row.id}
                            className="flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5"
                        >
                            <span className="text-sm font-bold text-white truncate">{row.name}</span>
                            {canManageLinks && row.canDelete ? (
                                <button
                                    type="button"
                                    data-testid={`${testIdPrefix}-remove-${row.id}`}
                                    onClick={() => onRemove(row.id)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                    title={removeLabel}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
            {canManageLinks ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                    <div className="md:col-span-3">
                        <SearchableEntitySelect
                            value={targetToLink}
                            onValueChange={setTargetToLink}
                            options={options}
                            placeholder={selectPlaceholder}
                            searchValue={searchValue}
                            onSearchChange={onSearchChange}
                            triggerTestId={`${testIdPrefix}-select`}
                        />
                    </div>
                    <button
                        type="button"
                        data-testid={`${testIdPrefix}-add`}
                        disabled={targetId === null || isAddPending}
                        onClick={() => {
                            if (targetId !== null) {
                                onAdd(targetId);
                                setTargetToLink('');
                            }
                        }}
                        className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        {addLabel}
                    </button>
                </div>
            ) : null}
        </div>
    );
}

/** ICT Register link sections on the Risk detail: Threats, Processes, Assets (issue #47). */
export function RiskRegisterLinksSection({ risk, canManageLinks }: RiskRegisterLinksSectionProps) {
    const { t } = useTranslation(['risks', 'common']);
    const queryClient = useQueryClient();
    const [linkError, setLinkError] = useState<string | null>(null);
    const [threatSearch, setThreatSearch] = useState('');
    const [processSearch, setProcessSearch] = useState('');
    const [assetSearch, setAssetSearch] = useState('');
    const debouncedThreatSearch = useDebouncedValue(threatSearch);
    const debouncedProcessSearch = useDebouncedValue(processSearch);
    const debouncedAssetSearch = useDebouncedValue(assetSearch);

    const threatLinksQuery = useQuery({
        queryKey: ictRegisterKeys.riskThreatLinks(risk.id),
        queryFn: () => riskRegisterLinksApi.getThreatLinks(risk.id),
    });
    const processLinksQuery = useQuery({
        queryKey: ictRegisterKeys.riskProcessLinks(risk.id),
        queryFn: () => riskRegisterLinksApi.getProcessLinks(risk.id),
    });
    const assetLinksQuery = useQuery({
        queryKey: ictRegisterKeys.riskAssetLinks(risk.id),
        queryFn: () => riskRegisterLinksApi.getAssetLinks(risk.id),
    });

    const threatOptionsQuery = useQuery({
        queryKey: ictRegisterKeys.threatOptions(debouncedThreatSearch),
        queryFn: () =>
            threatApi.getThreats({
                offset: 0,
                limit: 100,
                search: debouncedThreatSearch.trim() || undefined,
            }),
        staleTime: 60_000,
        enabled: canManageLinks,
    });
    const processOptionsQuery = useQuery({
        queryKey: ictRegisterKeys.processOptions(debouncedProcessSearch),
        queryFn: () =>
            processApi.getProcesses({
                offset: 0,
                limit: 100,
                search: debouncedProcessSearch.trim() || undefined,
            }),
        staleTime: 60_000,
        enabled: canManageLinks,
    });
    const assetOptionsQuery = useQuery({
        queryKey: ictRegisterKeys.assetOptions(debouncedAssetSearch),
        queryFn: () =>
            assetApi.getAssets({
                offset: 0,
                limit: 100,
                search: debouncedAssetSearch.trim() || undefined,
            }),
        staleTime: 60_000,
        enabled: canManageLinks,
    });

    const handleMutationError = (mutationError: unknown) => {
        logError('Risk register link mutation failed:', mutationError);
        setLinkError(t('register_links.errors.mutation_failed'));
    };

    const makeInvalidate = (queryKey: readonly unknown[]) => async () => {
        setLinkError(null);
        await queryClient.invalidateQueries({ queryKey });
    };

    const addThreatLink = useMutation({
        mutationFn: (threatId: number) => riskRegisterLinksApi.addThreatLink(risk.id, threatId),
        onSuccess: makeInvalidate(ictRegisterKeys.riskThreatLinks(risk.id)),
        onError: handleMutationError,
    });
    const removeThreatLink = useMutation({
        mutationFn: (linkId: number) => riskRegisterLinksApi.removeThreatLink(risk.id, linkId),
        onSuccess: makeInvalidate(ictRegisterKeys.riskThreatLinks(risk.id)),
        onError: handleMutationError,
    });
    const addProcessLink = useMutation({
        mutationFn: (processId: number) => riskRegisterLinksApi.addProcessLink(risk.id, processId),
        onSuccess: makeInvalidate(ictRegisterKeys.riskProcessLinks(risk.id)),
        onError: handleMutationError,
    });
    const removeProcessLink = useMutation({
        mutationFn: (linkId: number) => riskRegisterLinksApi.removeProcessLink(risk.id, linkId),
        onSuccess: makeInvalidate(ictRegisterKeys.riskProcessLinks(risk.id)),
        onError: handleMutationError,
    });
    const addAssetLink = useMutation({
        mutationFn: (assetId: number) => riskRegisterLinksApi.addAssetLink(risk.id, assetId),
        onSuccess: makeInvalidate(ictRegisterKeys.riskAssetLinks(risk.id)),
        onError: handleMutationError,
    });
    const removeAssetLink = useMutation({
        mutationFn: (linkId: number) => riskRegisterLinksApi.removeAssetLink(risk.id, linkId),
        onSuccess: makeInvalidate(ictRegisterKeys.riskAssetLinks(risk.id)),
        onError: handleMutationError,
    });

    const threatLinks = threatLinksQuery.data ?? [];
    const processLinks = processLinksQuery.data ?? [];
    const assetLinks = assetLinksQuery.data ?? [];

    return (
        <div className="glass-card space-y-6" data-testid="risk-register-links-section">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('register_links.title')}
                </h2>
            </div>

            {linkError ? (
                <div className="border border-rose-400/30 rounded-xl px-4 py-3 text-rose-300 text-sm font-medium">
                    {linkError}
                </div>
            ) : null}

            <LinkBlock
                icon={Flame}
                iconClass="text-amber-400"
                title={t('register_links.threats.title')}
                emptyLabel={t('register_links.threats.empty')}
                selectPlaceholder={t('register_links.threats.select_placeholder')}
                addLabel={t('register_links.add')}
                removeLabel={t('register_links.remove')}
                testIdPrefix="risk-threat-link"
                canManageLinks={canManageLinks}
                rows={threatLinks.map((link) => ({
                    id: link.id,
                    name: registerLinkRowName(link.threat_name, t('common:fallbacks.unknown_threat')),
                    canDelete: canDeleteRegisterLink(link),
                }))}
                options={buildRegisterLinkOptions(
                    (threatOptionsQuery.data?.items ?? []).map((threat) => ({
                        id: threat.id,
                        label: threat.name,
                        isArchived: threat.is_archived,
                    })),
                    new Set(threatLinks.map((link) => link.threat_id)),
                )}
                searchValue={threatSearch}
                onSearchChange={setThreatSearch}
                onAdd={(targetId) => addThreatLink.mutate(targetId)}
                onRemove={(linkId) => removeThreatLink.mutate(linkId)}
                isAddPending={addThreatLink.isPending}
            />

            <LinkBlock
                icon={Workflow}
                iconClass="text-sky-400"
                title={t('register_links.processes.title')}
                emptyLabel={t('register_links.processes.empty')}
                selectPlaceholder={t('register_links.processes.select_placeholder')}
                addLabel={t('register_links.add')}
                removeLabel={t('register_links.remove')}
                testIdPrefix="risk-process-link"
                canManageLinks={canManageLinks}
                rows={processLinks.map((link) => ({
                    id: link.id,
                    name: registerLinkRowName(link.process_name, t('common:fallbacks.unknown_process')),
                    canDelete: canDeleteRegisterLink(link),
                }))}
                options={buildRegisterLinkOptions(
                    (processOptionsQuery.data?.items ?? []).map((process) => ({
                        id: process.id,
                        label: process.l1_process,
                        isArchived: process.is_archived,
                    })),
                    new Set(processLinks.map((link) => link.process_id)),
                )}
                searchValue={processSearch}
                onSearchChange={setProcessSearch}
                onAdd={(targetId) => addProcessLink.mutate(targetId)}
                onRemove={(linkId) => removeProcessLink.mutate(linkId)}
                isAddPending={addProcessLink.isPending}
            />

            <LinkBlock
                icon={Server}
                iconClass="text-emerald-400"
                title={t('register_links.assets.title')}
                emptyLabel={t('register_links.assets.empty')}
                selectPlaceholder={t('register_links.assets.select_placeholder')}
                addLabel={t('register_links.add')}
                removeLabel={t('register_links.remove')}
                testIdPrefix="risk-asset-link"
                canManageLinks={canManageLinks}
                rows={assetLinks.map((link) => ({
                    id: link.id,
                    name: registerLinkRowName(link.asset_name, t('common:fallbacks.unknown_asset')),
                    canDelete: canDeleteRegisterLink(link),
                }))}
                options={buildRegisterLinkOptions(
                    (assetOptionsQuery.data?.items ?? []).map((asset) => ({
                        id: asset.id,
                        label: asset.name,
                        isArchived: asset.is_archived,
                    })),
                    new Set(assetLinks.map((link) => link.asset_id)),
                )}
                searchValue={assetSearch}
                onSearchChange={setAssetSearch}
                onAdd={(targetId) => addAssetLink.mutate(targetId)}
                onRemove={(linkId) => removeAssetLink.mutate(linkId)}
                isAddPending={addAssetLink.isPending}
            />
        </div>
    );
}
