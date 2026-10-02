import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldAlert } from 'lucide-react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LinkedItemList, LinkedItemRow, LinkRemoveButton } from '@/components/linking/LinkedItemList';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { InlineMessage } from '@/components/ui/inline-message';
import { SearchableEntitySelect } from '@/components/ui/SearchableEntitySelect';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { useFeedback } from '@/hooks/useFeedback';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { logError } from '@/services/logger';
import { riskApi } from '@/services/riskApi';
import { threatApi } from '@/services/threatApi';
import type { Threat } from '@/types/threat';

import { DetailSection } from '../detail/DetailSection';
import {
    buildLinkTargetOptions,
    canDeleteThreatRiskLink,
    parseLinkTargetId,
    threatRiskLinkRowLabel,
} from './threatRiskLinksPresentation';

interface ThreatRiskLinksSectionProps {
    threat: Threat;
    canManageLinks: boolean;
    onLinksChanged?: () => void | Promise<void>;
}

/** The Threat<->Risk Link relations managed from the Threat page (issue #47). */
export function ThreatRiskLinksSection({ threat, canManageLinks, onLinksChanged }: ThreatRiskLinksSectionProps) {
    const { t } = useTranslation(['threats', 'common']);
    const queryClient = useQueryClient();
    const feedback = useFeedback();
    const [linkError, setLinkError] = useState<string | null>(null);
    // GAP-C-01: link removal is confirmed first (D10 unlink intent); its
    // failure stays inside the open confirmation.
    const [pendingRemoval, setPendingRemoval] = useState<{ linkId: number; name: string } | null>(null);
    const [riskToLink, setRiskToLink] = useState('');
    const [riskSearch, setRiskSearch] = useState('');
    const debouncedRiskSearch = useDebouncedValue(riskSearch);

    const riskLinksQuery = useQuery({
        queryKey: ictRegisterKeys.threatRiskLinks(threat.id),
        queryFn: () => threatApi.getRiskLinks(threat.id),
    });
    const riskOptionsQuery = useQuery({
        queryKey: ictRegisterKeys.riskOptions(debouncedRiskSearch),
        queryFn: () =>
            riskApi.getRisks({
                offset: 0,
                limit: 100,
                search: debouncedRiskSearch.trim() || undefined,
            }),
        staleTime: 60_000,
    });

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
            setPendingRemoval(null);
            feedback.success({ title: t('common:outcome.link_removed') });
            await refreshLinks();
        },
        onError: (mutationError) => logError('Threat risk link removal failed:', mutationError),
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
        <DetailSection title={t('links.risks.title')} icon={ShieldAlert} testId="threat-risk-links-section">
            {linkError ? (
                <InlineMessage tone="danger" className="mb-4">{linkError}</InlineMessage>
            ) : null}

            <div className="space-y-4">
                {riskLinksQuery.isLoading ? (
                    <LoadingState layout="inline" testId="threat-risk-links-loading" />
                ) : riskLinksQuery.isError && !riskLinksQuery.data ? (
                    // GAP-C-11: a failed load is an error with retry, never "no linked risks".
                    <ErrorState
                        layout="inline"
                        onRetry={() => void riskLinksQuery.refetch()}
                        isRetrying={riskLinksQuery.isFetching}
                        testId="threat-risk-links-error"
                    />
                ) : riskLinks.length === 0 ? (
                    <EmptyState layout="inline" icon={null} title={t('links.risks.empty')} />
                ) : (
                    <LinkedItemList testId="threat-risk-links">
                        {riskLinks.map((link) => {
                            const rowLabel = threatRiskLinkRowLabel(link, t('common:fallbacks.unknown_risk'));
                            return (
                                <LinkedItemRow
                                    key={link.id}
                                    actions={canManageLinks && canDeleteThreatRiskLink(link) ? (
                                        <LinkRemoveButton
                                            name={rowLabel}
                                            testId={`threat-risk-link-remove-${link.id}`}
                                            onClick={() => setPendingRemoval({ linkId: link.id, name: rowLabel })}
                                        />
                                    ) : undefined}
                                >
                                    <span className="truncate text-sm font-bold text-foreground">{rowLabel}</span>
                                </LinkedItemRow>
                            );
                        })}
                    </LinkedItemList>
                )}

                {canManageLinks ? (
                    <div className="grid grid-cols-1 items-end gap-3 border-t border-border pt-4 md:grid-cols-4">
                        <Field label={t('links.risks.select_label')} className="md:col-span-3">
                            {(field) => (
                                <SearchableEntitySelect
                                    {...field}
                                    value={riskToLink}
                                    onValueChange={setRiskToLink}
                                    options={riskOptions}
                                    placeholder={t('links.risks.select_placeholder')}
                                    searchValue={riskSearch}
                                    onSearchChange={setRiskSearch}
                                    triggerTestId="threat-risk-link-select"
                                />
                            )}
                        </Field>
                        <Button
                            variant="accent"
                            data-testid="threat-risk-link-add"
                            disabled={targetRiskId === null || addRiskLink.isPending}
                            onClick={() => addRiskLink.mutate()}
                        >
                            <Plus aria-hidden="true" />
                            {t('links.add')}
                        </Button>
                    </div>
                ) : null}
            </div>
            <ConfirmDialog
                isOpen={pendingRemoval !== null}
                onClose={() => setPendingRemoval(null)}
                onConfirm={() => (pendingRemoval ? removeRiskLink.mutateAsync(pendingRemoval.linkId) : undefined)}
                intent="unlink"
                entityName={pendingRemoval?.name}
                isLoading={removeRiskLink.isPending}
            />
        </DetailSection>
    );
}
