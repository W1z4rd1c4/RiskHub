import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { DialogHeader, DialogShell } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ENTITY_ICONS } from '@/constants/entityIcons';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useFormat, useTranslation } from '@/i18n/hooks';
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

/**
 * Listbox option rows: full-width ghost buttons that keep the body text size, the
 * 20px entity icon and the active-descendant highlight (`aria-selected`).
 */
const OPTION_CLASS = 'h-auto w-full justify-start gap-3 whitespace-normal rounded-xl px-3 py-3 text-left text-base font-normal hover:bg-muted aria-selected:bg-accent/15 [&_svg]:size-5';

export function DestinationLauncher({ routes }: DestinationLauncherProps) {
    const { t } = useTranslation('navigation');
    const format = useFormat();
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
    const normalizedQuery = trimmedQuery.toLocaleLowerCase(format.locale);
    const filteredDestinations = normalizedQuery.length === 0
        ? []
        : destinations.filter((destination) => (
            destination.label.toLocaleLowerCase(format.locale).includes(normalizedQuery)
            || destination.supportingTerm?.toLocaleLowerCase(format.locale).includes(normalizedQuery)
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
            <Button
                variant="ghost"
                onClick={open}
                className="mb-4 h-auto w-full shrink-0 justify-between rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-foreground hover:bg-muted"
            >
                <span className="flex items-center gap-2">
                    <Search aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                    {t('go_to.trigger')}
                </span>
                <kbd aria-hidden="true" className="text-xs text-muted-foreground">
                    {t('go_to.shortcut')}
                </kbd>
            </Button>

            <DialogShell
                isOpen={isOpen}
                onClose={close}
                titleId={titleId}
                descriptionIds={[descriptionId]}
                initialFocusRef={searchRef}
                size="lg"
            >
                <DialogHeader
                    title={t('go_to.title')}
                    description={t('go_to.description')}
                    descriptionId={descriptionId}
                    closeLabel={t('go_to.close')}
                />

                <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
                    <label htmlFor={`${listboxId}-search`} className="sr-only">
                        {t('go_to.search_label')}
                    </label>
                    <Input
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
                        className="h-12 rounded-xl text-base"
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
                                            <Button
                                                variant="ghost"
                                                key={destination.href}
                                                id={destinationOptions[index].id}
                                                role="option"
                                                tabIndex={-1}
                                                aria-selected={index === activeIndex}
                                                aria-label={[destination.label, destination.supportingTerm]
                                                    .filter(Boolean)
                                                    .join(' ')}
                                                onClick={() => selectDestination(destination.href)}
                                                className={OPTION_CLASS}
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
                                            </Button>
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
                                            // NAV-03: a record shows its entity's icon from the shared map.
                                            const RecordIcon = ENTITY_ICONS[record.entity_type];
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
                                                <Button
                                                    variant="ghost"
                                                    key={`${record.entity_type}-${index}`}
                                                    id={recordOptions[index].id}
                                                    role="option"
                                                    tabIndex={-1}
                                                    aria-selected={optionIndex === activeIndex}
                                                    aria-label={accessibleName}
                                                    onClick={() => selectDestination(record.destination)}
                                                    className={OPTION_CLASS}
                                                >
                                                    <RecordIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
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
                                                </Button>
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
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            setRecordSearchState('loading');
                                            setRetryGeneration((current) => current + 1);
                                        }}
                                        className="mt-2 h-auto px-3 py-1 text-foreground hover:bg-muted"
                                    >
                                        {t('go_to.records_retry')}
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogShell>
        </>
    );
}
