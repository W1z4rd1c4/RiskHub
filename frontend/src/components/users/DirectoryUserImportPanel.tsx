import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { apiClient, ApiClientError } from '@/services/apiClient';
import { directoryApi } from '@/services/directoryApi';
import type { DirectoryImportResponse, DirectoryUser } from '@/types/directory';
import { logError } from '@/services/logger';

interface DirectoryUserImportPanelProps {
    onImported: (result: DirectoryImportResponse) => void | Promise<void>;
    onProviderUnavailableChange?: (isUnavailable: boolean) => void;
    className?: string;
}

function isProviderUnavailableError(error: unknown): boolean {
    if (error instanceof ApiClientError && error.status === 503) return true;
    const raw = apiClient.getRawErrorMessage(error)?.toLowerCase() ?? '';
    return raw.includes('no directory provider configured') || raw.includes('provider unavailable');
}

export function DirectoryUserImportPanel({
    onImported,
    onProviderUnavailableChange,
    className = '',
}: DirectoryUserImportPanelProps) {
    const { t } = useTranslation('admin');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DirectoryUser[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isImportingOid, setIsImportingOid] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const importingOidRef = useRef<string | null>(null);

    useEffect(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            setResults([]);
            setErrorMessage(null);
            onProviderUnavailableChange?.(false);
            setIsSearching(false);
            return;
        }

        const handle = window.setTimeout(async () => {
            try {
                setIsSearching(true);
                setErrorMessage(null);
                const users = await directoryApi.searchUsers(trimmed, 25);
                setResults(users);
                onProviderUnavailableChange?.(false);
            } catch (err) {
                logError('Directory search failed', err);
                const providerUnavailable = isProviderUnavailableError(err);
                onProviderUnavailableChange?.(providerUnavailable);
                setErrorMessage(providerUnavailable
                    ? `${t('users.directory_setup_required')} ${t('users.directory_setup_help')}`
                    : `${t('users.directory_search_failed')} ${t('users.directory_retry_help')}`);
            } finally {
                setIsSearching(false);
            }
        }, 250);

        return () => window.clearTimeout(handle);
    }, [query, t, onProviderUnavailableChange]);

    const hasResults = useMemo(() => results.length > 0, [results.length]);

    const handleImport = async (user: DirectoryUser) => {
        if (importingOidRef.current !== null) return;

        importingOidRef.current = user.external_id;
        try {
            setIsImportingOid(user.external_id);
            setErrorMessage(null);
            const response = await directoryApi.importUser(user.external_id);
            await onImported(response);
            onProviderUnavailableChange?.(false);
        } catch (err) {
            logError('Directory import failed', err);
            const providerUnavailable = isProviderUnavailableError(err);
            onProviderUnavailableChange?.(providerUnavailable);
            setErrorMessage(providerUnavailable
                ? `${t('users.directory_setup_required')} ${t('users.directory_setup_help')}`
                : `${t('users.directory_import_failed')} ${t('users.directory_retry_help')}`);
        } finally {
            importingOidRef.current = null;
            setIsImportingOid(null);
        }
    };

    return (
        <div className={`space-y-4 ${className}`.trim()}>
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label={t('users.directory_search_placeholder')}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 py-2 pl-10 pr-3 text-sm text-white outline-none transition focus:border-accent/70"
                    placeholder={t('users.directory_search_placeholder')}
                />
            </div>

            {errorMessage && (
                <div
                    role="alert"
                    className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
                >
                    {errorMessage}
                </div>
            )}

            <div className="max-h-96 overflow-y-auto rounded-xl border border-white/10">
                {isSearching ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-400">
                        {t('users.directory_searching')}
                    </div>
                ) : hasResults ? (
                    <ul className="divide-y divide-white/10">
                        {results.map((entry) => (
                            <li key={entry.external_id} className="flex items-center justify-between gap-4 px-4 py-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-white">{entry.display_name}</p>
                                    <p className="truncate text-xs text-slate-400">
                                        {entry.email || entry.user_principal_name || t('common:fallbacks.not_available')}
                                    </p>
                                    <p className="truncate text-xs text-slate-500">
                                        {entry.department || t('access.table.no_department')}
                                        {entry.job_title ? ` • ${entry.job_title}` : ''}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handleImport(entry)}
                                    aria-busy={isImportingOid === entry.external_id}
                                    aria-disabled={isImportingOid !== null}
                                    className={`inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover ${isImportingOid !== null ? 'cursor-not-allowed opacity-60' : ''}`}
                                >
                                    <UserPlus className="h-3.5 w-3.5" />
                                    {isImportingOid === entry.external_id
                                        ? t('users.importing')
                                        : t('users.import')}
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="px-4 py-8 text-center text-sm text-slate-300">
                        {query.trim()
                            ? t('users.directory_no_results')
                            : t('users.directory_search_hint')}
                    </div>
                )}
            </div>
        </div>
    );
}
