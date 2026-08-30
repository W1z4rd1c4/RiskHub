import { useEffect, useId, useRef, useState } from 'react';
import { FileText, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { DialogShell } from '@/components/DialogShell';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';
import type { SidebarNavRoute } from '@/routing';
import { goToApi } from '@/services/goToApi';
import type { GoToRecord } from '@/types/goTo';

type DestinationLauncherProps = {
    routes: readonly SidebarNavRoute[];
};

type RecordSearchState = 'idle' | 'settling' | 'loading' | 'success' | 'error';

const RECORD_STATUS_TRANSLATION_KEYS: Readonly<Record<string, string>> = {
    active: 'active',
    closed: 'closed',
    draft: 'draft',
    emerging: 'emerging',
    inactive: 'inactive',
    in_progress: 'in_progress',
    open: 'open',
    ready_for_validation: 'ready_for_validation',
    triaged: 'triaged',
};

export function DestinationLauncher({ routes }: DestinationLauncherProps) {
    const { t, i18n } = useTranslation('navigation');
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [records, setRecords] = useState<GoToRecord[]>([]);
    const [recordSearchState, setRecordSearchState] = useState<RecordSearchState>('idle');
    const [retryGeneration, setRetryGeneration] = useState(0);
    const [recordQueryRevision, setRecordQueryRevision] = useState(0);
    const searchRef = useRef<HTMLInputElement>(null);
    const recordRequestGenerationRef = useRef(0);
    const startedRecordRequestRef = useRef<string | null>(null);
    const titleId = useId();
    const descriptionId = useId();
    const destinationsTitleId = useId();
    const recordsTitleId = useId();
    const listboxId = useId();
    const destinationStatusId = useId();
    const recordStatusId = useId();

    const destinations = routes.map((route) => ({
        href: route.nav.href,
        icon: route.nav.icon,
        key: route.key,
        label: t(`sidebar.${route.nav.labelKey}`),
        supportingTerm: route.nav.supportingTermKey
            ? t(`destination_supporting_terms.${route.nav.supportingTermKey}`)
            : null,
    }));
    const trimmedQuery = query.trim();
    const recordQueryToken = `${recordQueryRevision}\u0000${trimmedQuery}`;
    const debouncedRecordQueryToken = useDebouncedValue(recordQueryToken);
    const normalizedQuery = trimmedQuery.toLocaleLowerCase(i18n.language);
    const filteredDestinations = normalizedQuery.length === 0
        ? []
        : destinations.filter((destination) => (
            destination.label.toLocaleLowerCase(i18n.language).includes(normalizedQuery)
            || destination.supportingTerm?.toLocaleLowerCase(i18n.language).includes(normalizedQuery)
        ));
    const destinationOptions = filteredDestinations.map((destination) => ({
        id: `${listboxId}-destination-${destination.key}`,
        href: destination.href,
    }));
    const recordOptions = records.map((record, index) => ({
        id: `${listboxId}-record-${index}`,
        href: record.destination,
    }));
    const options = [...destinationOptions, ...recordOptions];
    const activeOptionId = options[activeIndex]?.id;
    const destinationStatusMessage = normalizedQuery.length === 0
        ? t('go_to.blank_prompt')
        : filteredDestinations.length === 0
            ? t('go_to.empty')
            : '';
    const recordStatusMessage = trimmedQuery.length < 2
        ? t('go_to.records_prompt')
        : recordSearchState === 'settling' || recordSearchState === 'loading'
            ? t('go_to.records_searching')
            : recordSearchState === 'error'
                ? t('go_to.records_unavailable')
                : recordSearchState === 'success' && records.length === 0
                    ? t('go_to.records_empty')
                    : '';

    useEffect(() => {
        if (!isOpen || trimmedQuery.length < 2 || debouncedRecordQueryToken !== recordQueryToken) return;

        const requestKey = `${recordQueryToken}\u0000${retryGeneration}`;
        if (startedRecordRequestRef.current === requestKey) return;
        startedRecordRequestRef.current = requestKey;
        const generation = ++recordRequestGenerationRef.current;
        setRecordSearchState('loading');

        void goToApi.getRecords(trimmedQuery)
            .then((nextRecords) => {
                if (recordRequestGenerationRef.current !== generation) return;
                setRecords(nextRecords);
                setRecordSearchState('success');
            })
            .catch(() => {
                if (recordRequestGenerationRef.current !== generation) return;
                setRecords([]);
                setRecordSearchState('error');
            });
    }, [debouncedRecordQueryToken, isOpen, recordQueryToken, retryGeneration, trimmedQuery]);

    useEffect(() => {
        const handleShortcut = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setQuery('');
                setActiveIndex(0);
                setRecords([]);
                setRecordSearchState('idle');
                setRetryGeneration(0);
                setRecordQueryRevision((current) => current + 1);
                startedRecordRequestRef.current = null;
                recordRequestGenerationRef.current += 1;
                setIsOpen(true);
            }
        };

        document.addEventListener('keydown', handleShortcut);
        return () => document.removeEventListener('keydown', handleShortcut);
    }, []);

    useEffect(() => {
        if (!activeOptionId) return;
        document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' });
    }, [activeOptionId]);

    useEffect(() => {
        setActiveIndex((current) => options.length === 0
            ? 0
            : Math.min(current, options.length - 1));
    }, [options.length]);

    const close = () => {
        recordRequestGenerationRef.current += 1;
        startedRecordRequestRef.current = null;
        setRecords([]);
        setRecordSearchState('idle');
        setIsOpen(false);
    };
    const open = () => {
        recordRequestGenerationRef.current += 1;
        startedRecordRequestRef.current = null;
        setQuery('');
        setActiveIndex(0);
        setRecords([]);
        setRecordSearchState('idle');
        setRetryGeneration(0);
        setRecordQueryRevision((current) => current + 1);
        setIsOpen(true);
    };
    const selectDestination = (href: string) => {
        close();
        void navigate(href);
    };

    return (
        <>
            <button
                type="button"
                onClick={open}
                className="mb-4 flex w-full shrink-0 items-center justify-between rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
                <span className="flex items-center gap-2">
                    <Search aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                    {t('go_to.trigger')}
                </span>
                <kbd aria-hidden="true" className="text-xs text-muted-foreground">
                    {t('go_to.shortcut')}
                </kbd>
            </button>

            <DialogShell
                isOpen={isOpen}
                onClose={close}
                titleId={titleId}
                descriptionIds={[descriptionId]}
                initialFocusRef={searchRef}
                contentClassName="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden glass-card !p-0 shadow-2xl"
            >
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5">
                    <div>
                        <h2 id={titleId} className="text-xl font-semibold text-foreground">
                            {t('go_to.title')}
                        </h2>
                        <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">
                            {t('go_to.description')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        aria-label={t('go_to.close')}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <X aria-hidden="true" className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
                    <label htmlFor={`${listboxId}-search`} className="sr-only">
                        {t('go_to.search_label')}
                    </label>
                    <input
                        id={`${listboxId}-search`}
                        ref={searchRef}
                        role="combobox"
                        aria-autocomplete="list"
                        aria-controls={listboxId}
                        aria-activedescendant={activeOptionId}
                        aria-describedby={`${destinationStatusId} ${recordStatusId}`}
                        aria-expanded="true"
                        value={query}
                        onChange={(event) => {
                            const nextQuery = event.target.value;
                            const nextTrimmedQuery = nextQuery.trim();
                            setQuery(nextQuery);
                            setActiveIndex(0);

                            if (nextTrimmedQuery !== trimmedQuery) {
                                recordRequestGenerationRef.current += 1;
                                startedRecordRequestRef.current = null;
                                setRecords([]);
                                setRecordSearchState(nextTrimmedQuery.length >= 2 ? 'settling' : 'idle');
                                setRetryGeneration(0);
                                setRecordQueryRevision((current) => current + 1);
                            }
                        }}
                        onKeyDown={(event) => {
                            if (options.length === 0) return;

                            if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                setActiveIndex((current) => (current + 1) % options.length);
                            } else if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                setActiveIndex((current) => (
                                    current - 1 + options.length
                                ) % options.length);
                            } else if (event.key === 'Enter') {
                                event.preventDefault();
                                const activeOption = options[activeIndex];
                                if (activeOption) selectDestination(activeOption.href);
                            }
                        }}
                        placeholder={t('go_to.search_placeholder')}
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />

                    <div className="flex min-h-0 flex-1 flex-col">
                        <div
                            id={listboxId}
                            role="listbox"
                            aria-label={t('go_to.results')}
                            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain"
                        >
                                {filteredDestinations.length > 0 ? (
                                    <div role="group" aria-labelledby={destinationsTitleId} className="space-y-1">
                                        <div role="presentation">
                                            <h3 id={destinationsTitleId} className="mb-2 text-sm font-semibold text-foreground">
                                                {t('go_to.destinations')}
                                            </h3>
                                        </div>
                                        {filteredDestinations.map((destination, index) => (
                                            <button
                                                key={destination.href}
                                                id={destinationOptions[index].id}
                                                type="button"
                                                role="option"
                                                tabIndex={-1}
                                                aria-selected={index === activeIndex}
                                                aria-label={[destination.label, destination.supportingTerm]
                                                    .filter(Boolean)
                                                    .join(' ')}
                                                onClick={() => selectDestination(destination.href)}
                                                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-muted aria-selected:bg-accent/15"
                                            >
                                                <destination.icon aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
                                                <span className="min-w-0">
                                                    <span className="block font-medium text-foreground">
                                                        {destination.label}
                                                    </span>
                                                    {destination.supportingTerm ? (
                                                        <span className="block text-sm text-muted-foreground">
                                                            {destination.supportingTerm}
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                ) : null}

                                {records.length > 0 ? (
                                    <div role="group" aria-labelledby={recordsTitleId} className="space-y-1">
                                        <div role="presentation">
                                            <h3 id={recordsTitleId} className="mb-2 text-sm font-semibold text-foreground">
                                                {t('go_to.records')}
                                            </h3>
                                        </div>
                                        {records.map((record, index) => {
                                            const optionIndex = filteredDestinations.length + index;
                                            const entityLabel = t(`go_to.record_types.${record.entity_type}`);
                                            const statusKey = RECORD_STATUS_TRANSLATION_KEYS[record.status];
                                            const statusLabel = statusKey
                                                ? t(`go_to.record_statuses.${statusKey}`)
                                                : t('go_to.record_statuses.unknown');
                                            const accessibleName = [
                                                entityLabel,
                                                record.business_identifier,
                                                record.display_name,
                                                statusLabel,
                                            ].filter(Boolean).join(' ');

                                            return (
                                                <button
                                                    key={`${record.entity_type}-${index}`}
                                                    id={recordOptions[index].id}
                                                    type="button"
                                                    role="option"
                                                    tabIndex={-1}
                                                    aria-selected={optionIndex === activeIndex}
                                                    aria-label={accessibleName}
                                                    onClick={() => selectDestination(record.destination)}
                                                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-muted aria-selected:bg-accent/15"
                                                >
                                                    <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-medium text-foreground">
                                                            {record.display_name}
                                                        </span>
                                                        <span className="block truncate text-sm text-muted-foreground">
                                                            {[entityLabel, record.business_identifier, statusLabel]
                                                                .filter(Boolean)
                                                                .join(' · ')}
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                        </div>

                        <div className="shrink-0 text-center text-sm text-muted-foreground">
                            <p
                                id={destinationStatusId}
                                role="status"
                                className={cn('py-2', !destinationStatusMessage && 'sr-only')}
                            >
                                {destinationStatusMessage}
                            </p>
                            <div className={cn('pb-2', !recordStatusMessage && 'sr-only')}>
                                <p id={recordStatusId} role="status">
                                    {recordStatusMessage}
                                </p>
                                {recordSearchState === 'error' ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRecordSearchState('loading');
                                            setRetryGeneration((current) => current + 1);
                                        }}
                                        className="mt-2 rounded-lg px-3 py-1 font-medium text-foreground hover:bg-muted"
                                    >
                                        {t('go_to.records_retry')}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogShell>
        </>
    );
}
