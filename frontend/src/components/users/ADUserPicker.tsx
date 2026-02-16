import { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { directoryApi } from '@/services/directoryApi';
import type { DirectoryImportResponse, DirectoryUser } from '@/types/directory';

interface ADUserPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onImported: (result: DirectoryImportResponse) => void;
}

export function ADUserPicker({ isOpen, onClose, onImported }: ADUserPickerProps) {
    const { t } = useTranslation('admin');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DirectoryUser[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isImportingOid, setIsImportingOid] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setQuery('');
            setResults([]);
            setError(null);
            setIsSearching(false);
            setIsImportingOid(null);
            return;
        }

        const trimmed = query.trim();
        if (!trimmed) {
            setResults([]);
            setError(null);
            return;
        }

        const handle = window.setTimeout(async () => {
            try {
                setIsSearching(true);
                setError(null);
                const users = await directoryApi.searchUsers(trimmed, 25);
                setResults(users);
            } catch (err) {
                console.error('Directory search failed', err);
                setError(t('users.directory_search_failed', { defaultValue: 'Directory search failed.' }));
            } finally {
                setIsSearching(false);
            }
        }, 250);

        return () => window.clearTimeout(handle);
    }, [isOpen, query, t]);

    const hasResults = useMemo(() => results.length > 0, [results.length]);

    const handleImport = async (user: DirectoryUser) => {
        try {
            setIsImportingOid(user.external_id);
            setError(null);
            const response = await directoryApi.importUser(user.external_id);
            onImported(response);
        } catch (err) {
            console.error('Directory import failed', err);
            setError(t('users.directory_import_failed', { defaultValue: 'Directory import failed.' }));
        } finally {
            setIsImportingOid(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                type="button"
                className="absolute inset-0 bg-black/60"
                onClick={onClose}
                aria-label={t('common:actions.close')}
            />
            <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">
                        {t('users.add_from_ad', { defaultValue: 'Add from Directory' })}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                        aria-label={t('common:actions.close')}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="relative mb-4">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-slate-950 py-2 pl-10 pr-3 text-sm text-white outline-none transition focus:border-accent/70"
                        placeholder={t('users.directory_search_placeholder', { defaultValue: 'Search by name or email' })}
                    />
                </div>

                {error && (
                    <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                        {error}
                    </div>
                )}

                <div className="max-h-96 overflow-y-auto rounded-xl border border-white/10">
                    {isSearching ? (
                        <div className="px-4 py-8 text-center text-sm text-slate-400">
                            {t('users.directory_searching', { defaultValue: 'Searching directory...' })}
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
                                        onClick={() => handleImport(entry)}
                                        disabled={isImportingOid === entry.external_id}
                                        className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <UserPlus className="h-3.5 w-3.5" />
                                        {isImportingOid === entry.external_id
                                            ? t('users.importing', { defaultValue: 'Importing...' })
                                            : t('users.import', { defaultValue: 'Import' })}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="px-4 py-8 text-center text-sm text-slate-500">
                            {query.trim()
                                ? t('users.directory_no_results', { defaultValue: 'No directory users found.' })
                                : t('users.directory_search_hint', { defaultValue: 'Type to search your directory.' })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
