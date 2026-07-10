import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Trash2 } from 'lucide-react';

import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { logError } from '@/services/logger';
import { processApi } from '@/services/processApi';
import { vendorApi } from '@/services/vendorApi';
import type { Process } from '@/types/process';

import {
    buildProcessVendorLinkPayload,
    canDeleteProcessVendorLink,
    formatProcessVendorLinkMeta,
} from './processVendorLinksPresentation';

interface ProcessVendorLinksSectionProps {
    process: Process;
    canManageLinks: boolean;
    onLinksChanged?: () => void | Promise<void>;
}

/** The manual Process<->Vendor Link relations (sheet 11 §1, issue #46). */
export function ProcessVendorLinksSection({ process, canManageLinks, onLinksChanged }: ProcessVendorLinksSectionProps) {
    const { t } = useTranslation('processes');
    const queryClient = useQueryClient();
    const [linkError, setLinkError] = useState<string | null>(null);

    const [vendorToLink, setVendorToLink] = useState('');
    const [serviceDescription, setServiceDescription] = useState('');

    const vendorLinksQuery = useQuery({
        queryKey: ictRegisterKeys.processVendorLinks(process.id),
        queryFn: () => processApi.getVendorLinks(process.id),
    });
    const vendorOptionsQuery = useQuery({
        queryKey: ictRegisterKeys.vendorOptions(),
        queryFn: () => vendorApi.getVendors({ offset: 0, limit: 100 }),
        staleTime: 60_000,
    });

    const vendorNameById = useMemo(() => {
        const map = new Map<number, string>();
        for (const vendor of vendorOptionsQuery.data?.items ?? []) {
            map.set(vendor.id, vendor.name);
        }
        return map;
    }, [vendorOptionsQuery.data]);

    const refreshLinks = async () => {
        await queryClient.invalidateQueries({ queryKey: ictRegisterKeys.processVendorLinks(process.id) });
        await onLinksChanged?.();
    };

    const handleMutationError = (mutationError: unknown) => {
        logError('Process vendor link mutation failed:', mutationError);
        setLinkError(t('links.errors.mutation_failed'));
    };

    const linkPayload = buildProcessVendorLinkPayload({
        vendor_id: vendorToLink,
        direct_service_description: serviceDescription,
    });

    const addVendorLink = useMutation({
        mutationFn: () => {
            if (!linkPayload) {
                return Promise.reject(new Error('Vendor is required'));
            }
            return processApi.addVendorLink(process.id, linkPayload);
        },
        onSuccess: async () => {
            setLinkError(null);
            setVendorToLink('');
            setServiceDescription('');
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const removeVendorLink = useMutation({
        mutationFn: (linkId: number) => processApi.removeVendorLink(process.id, linkId),
        onSuccess: async () => {
            setLinkError(null);
            await refreshLinks();
        },
        onError: handleMutationError,
    });

    const vendorLinks = vendorLinksQuery.data ?? [];
    const linkedVendorIds = new Set(vendorLinks.map((link) => link.vendor_id));
    const vendorOptions = (vendorOptionsQuery.data?.items ?? [])
        .filter((vendor) => !vendor.is_archived && !linkedVendorIds.has(vendor.id))
        .map((vendor) => ({ value: String(vendor.id), label: vendor.name }));

    return (
        <div className="glass-card space-y-5" data-testid="process-vendor-links-section">
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <Building2 className="h-5 w-5 text-emerald-400" />
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {t('links.vendors.title')}
                </h2>
            </div>

            {linkError ? (
                <div className="border border-rose-400/30 rounded-xl px-4 py-3 text-rose-300 text-sm font-medium">
                    {linkError}
                </div>
            ) : null}

            <div className="space-y-4">
                {vendorLinks.length === 0 ? (
                    <p className="text-xs text-slate-500">{t('links.vendors.empty')}</p>
                ) : (
                    <ul className="space-y-2" data-testid="process-vendor-links">
                        {vendorLinks.map((link) => (
                            <li
                                key={link.id}
                                className="flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3"
                            >
                                <div className="min-w-0">
                                    <span className="text-sm font-bold text-white truncate">
                                        {vendorNameById.get(link.vendor_id) ?? `#${link.vendor_id}`}
                                    </span>
                                    <p className="text-xs text-slate-500">
                                        {formatProcessVendorLinkMeta(link) || t('links.vendors.no_metadata')}
                                    </p>
                                </div>
                                {canManageLinks && canDeleteProcessVendorLink(link) ? (
                                    <button
                                        type="button"
                                        data-testid={`process-vendor-link-remove-${link.id}`}
                                        onClick={() => removeVendorLink.mutate(link.id)}
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
                    <div className="border-t border-white/5 pt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                        <div className="md:col-span-2">
                            <ThemedSelect
                                value={vendorToLink}
                                onValueChange={setVendorToLink}
                                options={vendorOptions}
                                placeholder={t('links.vendors.select_placeholder')}
                                triggerTestId="process-vendor-link-select"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <input
                                type="text"
                                data-testid="process-vendor-link-description"
                                value={serviceDescription}
                                onChange={(event) => setServiceDescription(event.target.value)}
                                placeholder={t('links.vendors.description')}
                                className="w-full glass rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 bg-white/5 border border-white/10 focus:outline-none focus:border-accent/50"
                            />
                        </div>
                        <button
                            type="button"
                            data-testid="process-vendor-link-add"
                            disabled={!linkPayload || addVendorLink.isPending}
                            onClick={() => addVendorLink.mutate()}
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
